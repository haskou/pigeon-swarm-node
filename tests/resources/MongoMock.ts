import { MongoMemoryServer } from 'mongodb-memory-server';
import { Db, MongoClient } from 'mongodb';
import path from 'path';
import fs from 'fs';

export default class MongoMock {
  private server: MongoMemoryServer;
  private readonly dbPath = path.join('/tmp/mongo');

  public createDbPath() {
    try {
      fs.mkdirSync(this.dbPath);
    } catch (error) {
      /* empty */
    }
  }

  public async getDomainDb(domainName: string) {
    const client = await MongoClient.connect(
      `${process.env.MONGO_URI}${domainName}`,
    );

    return client.db(domainName);
  }

  public async init() {
    if (!this.server) {
      this.createDbPath();
      this.server = await MongoMemoryServer.create({
        instance: {
          port: 53878,
          dbName: 'dev',
          dbPath: this.dbPath,
        },
      });
    }
  }

  public async restart() {
    if (this.server) {
      await this.server.stop({ doCleanup: true });
      await this.server.start(true);
    }
  }

  public async getGlobalDb(): Promise<Db> {
    const client = await MongoClient.connect(this.server.getUri());

    return client.db();
  }

  public async insert(collectionName: string, data: Record<string, unknown>[]) {
    if (!data.length) {
      return;
    }

    const db = await this.getGlobalDb();
    await db.collection(collectionName).insertMany(data);
  }
}
