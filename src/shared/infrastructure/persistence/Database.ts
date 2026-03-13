import Kernel from '@app/Kernel';
import { Db, MongoClient } from 'mongodb';

import Persistence from './Persistence';

export default class Database implements Persistence {
  private static instance: Database;
  private readonly protocol: string;
  private mongoClient: MongoClient | undefined;
  private globalDb: Db | undefined;

  public static getInstance(): Database {
    if (this.instance) {
      return this.instance;
    }
    this.instance = new Database();

    return this.instance;
  }

  constructor() {
    this.protocol = process.env.MONGO_URI || '';
  }

  private async initializeMongoClient(): Promise<void> {
    try {
      const db = new MongoClient(this.protocol || '');
      this.mongoClient = await db.connect();
    } catch (err: unknown) {
      Kernel.logger.error((err as Error).message);
    }
  }

  private initializeGlobalDb(): Promise<void> {
    try {
      this.globalDb = this.mongoClient?.db();

      return Promise.resolve();
    } catch (err: unknown) {
      Kernel.logger.error((err as Error).message);

      return Promise.reject(err);
    }
  }

  private async closeDb(): Promise<void> {
    try {
      await this.mongoClient?.close();
    } catch (err: unknown) {
      Kernel.logger.error((err as Error).message);
    }
  }

  private async initialize(): Promise<void> {
    await this.initializeMongoClient();
    await this.initializeGlobalDb();
  }

  public async globalDataSource(): Promise<Db | undefined> {
    if (!this.mongoClient) {
      await this.initialize();
    }

    return this.globalDb;
  }

  public async authenticate(): Promise<void> {
    await this.initialize();
  }

  public async sync(): Promise<void> {
    // No need to sync in MongoDB
  }
}
