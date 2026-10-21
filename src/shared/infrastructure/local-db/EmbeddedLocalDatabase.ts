import { KeyedSerialQueue } from '@app/shared/infrastructure/concurrency/KeyedSerialQueue';
import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';
import Kernel from '@haskou/ddd-kernel';
import { Level } from 'level';
import path from 'path';

import LocalDatabaseIsLockedError from './LocalDatabaseIsLockedError';

export type EmbeddedLocalDatabaseOperation =
  | {
      type: 'put';
      namespace: string;
      id: string;
      document: Record<string, unknown>;
    }
  | {
      type: 'del';
      namespace: string;
      id: string;
    };

export default class EmbeddedLocalDatabase {
  private static readonly databases = new Map<
    string,
    Level<string, Record<string, unknown>>
  >();

  // Keyed by path, like `databases`: every handle on one database shares them.
  private static readonly exclusiveSections = new KeyedSerialQueue();

  private readonly database: Level<string, Record<string, unknown>>;
  private readonly databasePath: string;

  private static getDatabase(
    databasePath: string,
  ): Level<string, Record<string, unknown>> {
    const currentDatabase = EmbeddedLocalDatabase.databases.get(databasePath);

    if (currentDatabase && currentDatabase.status !== 'closed') {
      return currentDatabase;
    }

    const database = new Level<string, Record<string, unknown>>(databasePath, {
      valueEncoding: 'json',
    });

    EmbeddedLocalDatabase.databases.set(databasePath, database);

    return database;
  }

  /** Closes every open handle so LevelDB flushes its logs before the process exits. */
  public static async closeAll(): Promise<void> {
    const databases = [...EmbeddedLocalDatabase.databases.values()];

    EmbeddedLocalDatabase.databases.clear();
    await Promise.all(
      databases
        .filter((database) => database.status !== 'closed')
        .map((database) => database.close()),
    );
  }

  constructor() {
    this.databasePath =
      pigeonEnvironment().PIGEON_LOCAL_DB_PATH ||
      path.join(Kernel.rootDirectory, 'local_storage');
    this.database = EmbeddedLocalDatabase.getDatabase(this.databasePath);
  }

  /** LevelDB holds a lock file while open, so a running node keeps others out. */
  private async open(): Promise<void> {
    try {
      await this.database.open();
    } catch (error: unknown) {
      const cause = error instanceof Error ? error.cause : undefined;

      if (
        typeof cause === 'object' &&
        cause !== null &&
        'code' in cause &&
        cause.code === 'LEVEL_LOCKED'
      ) {
        throw new LocalDatabaseIsLockedError(this.databasePath);
      }

      throw error;
    }
  }

  private async ensureOpen(): Promise<void> {
    if (this.database.status === 'open') {
      return;
    }

    if (this.database.status === 'opening') {
      await this.open();

      return;
    }

    // Closed but still registered: the open failed (for example on the lock)
    // and may be retried; `close()` unregisters the instance it closes.
    if (
      this.database.status === 'closed' &&
      EmbeddedLocalDatabase.databases.get(this.databasePath) === this.database
    ) {
      await this.open();

      return;
    }

    if (this.database.status === 'closed') {
      throw new Error(
        `Local database is closed and cannot be reused: ${this.databasePath}`,
      );
    }

    throw new Error(
      `Local database is not available: path=${this.databasePath} status=${this.database.status}`,
    );
  }

  private key(namespace: string, id: string): string {
    return `${namespace}:${id}`;
  }

  private prefix(namespace: string): string {
    return `${namespace}:`;
  }

  public async clear(): Promise<void> {
    await this.ensureOpen();
    await this.database.clear();
  }

  public async commit(
    operations: EmbeddedLocalDatabaseOperation[],
  ): Promise<void> {
    await this.ensureOpen();
    const keys = operations.map((operation) =>
      this.key(operation.namespace, operation.id),
    );

    if (new Set(keys).size !== keys.length) {
      throw new Error('Duplicate local database batch key');
    }

    await this.database.batch(
      operations.map((operation, index) =>
        operation.type === 'put'
          ? {
              key: keys[index],
              type: 'put' as const,
              value: { ...operation.document, _id: operation.id },
            }
          : { key: keys[index], type: 'del' as const },
      ),
    );
  }

  public async close(): Promise<void> {
    if (this.database.status === 'closed') {
      EmbeddedLocalDatabase.databases.delete(this.databasePath);

      return;
    }

    await this.database.close();
    EmbeddedLocalDatabase.databases.delete(this.databasePath);
  }

  public async delete(namespace: string, id: string): Promise<void> {
    await this.ensureOpen();
    await this.database.del(this.key(namespace, id));
  }

  public async deleteMany(
    namespace: string,
    matcher: (document: Record<string, unknown>) => boolean,
  ): Promise<void> {
    const documents = await this.find(namespace, matcher);

    await Promise.all(
      documents.map((document) => {
        const id = typeof document._id === 'string' ? document._id : undefined;

        return id ? this.delete(namespace, id) : Promise.resolve();
      }),
    );
  }

  /**
   * Runs `action` with no other section of the same `scope` on this database
   * in between, whichever handle opened it, so a read-modify-write is atomic.
   * Sections on one scope do not nest: entering one from inside itself throws
   * `KeyedSerialSectionIsNestedError` instead of waiting on itself forever.
   */
  public async exclusively<T>(
    scope: string,
    action: () => Promise<T>,
  ): Promise<T> {
    return EmbeddedLocalDatabase.exclusiveSections.run(
      `${this.databasePath}\n${scope}`,
      action,
    );
  }

  public async find(
    namespace: string,
    matcher: (document: Record<string, unknown>) => boolean = () => true,
  ): Promise<Array<Record<string, unknown>>> {
    await this.ensureOpen();
    const documents: Array<Record<string, unknown>> = [];

    for await (const [, value] of this.database.iterator({
      gte: this.prefix(namespace),
      lt: `${this.prefix(namespace)}\xff`,
    })) {
      if (matcher(value)) {
        documents.push(value);
      }
    }

    return documents;
  }

  public async findOne(
    namespace: string,
    id: string,
  ): Promise<Record<string, unknown> | undefined> {
    await this.ensureOpen();

    try {
      return await this.database.get(this.key(namespace, id));
    } catch (error) {
      if ((error as { code?: string }).code === 'LEVEL_NOT_FOUND') {
        return undefined;
      }

      throw error;
    }
  }

  public async save(
    namespace: string,
    id: string,
    document: Record<string, unknown>,
  ): Promise<void> {
    await this.ensureOpen();
    await this.database.put(this.key(namespace, id), {
      ...document,
      _id: id,
    });
  }
}
