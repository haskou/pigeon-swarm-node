import Kernel from '@app/Kernel';
import { Level } from 'level';
import path from 'path';

export default class EmbeddedLocalDatabase {
  private readonly database: Level<string, Record<string, unknown>>;

  constructor() {
    this.database = new Level<string, Record<string, unknown>>(
      process.env.PIGEON_LOCAL_DB_PATH ||
        path.join(Kernel.rootDirectory, 'local_storage'),
      {
        valueEncoding: 'json',
      },
    );
  }

  private key(namespace: string, id: string): string {
    return `${namespace}:${id}`;
  }

  private prefix(namespace: string): string {
    return `${namespace}:`;
  }

  public async clear(): Promise<void> {
    await this.database.clear();
  }

  public async delete(namespace: string, id: string): Promise<void> {
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
    await this.database.put(this.key(namespace, id), {
      ...document,
      _id: id,
    });
  }
}
