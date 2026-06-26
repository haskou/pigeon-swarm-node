import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';
import Kernel from '@haskou/ddd-kernel';
import { Level } from 'level';
import path from 'path';

export default class EmbeddedLocalDatabase {
  private static readonly databases = new Map<
    string,
    Level<string, Record<string, unknown>>
  >();

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

  constructor() {
    this.databasePath =
      pigeonEnvironment().PIGEON_LOCAL_DB_PATH ||
      path.join(Kernel.rootDirectory, 'local_storage');
    this.database = EmbeddedLocalDatabase.getDatabase(this.databasePath);
  }

  private async ensureOpen(): Promise<void> {
    if (this.database.status === 'open') {
      return;
    }

    if (this.database.status === 'opening') {
      await this.database.open();

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
