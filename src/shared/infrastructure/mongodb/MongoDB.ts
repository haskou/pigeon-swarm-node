import { Collection, Db, Document, MongoClient } from 'mongodb';

export default class MongoDB {
  private client?: MongoClient;
  private database?: Db;

  constructor(
    private readonly url: string = process.env.MONGO_URL ||
      'mongodb://localhost:27017',
    private readonly databaseName: string = process.env.MONGO_DATABASE ||
      'pigeon_swarm',
    private readonly serverSelectionTimeoutMS: number = Number(
      process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 1000,
    ),
  ) {}

  private async getDatabase(): Promise<Db> {
    if (!this.client) {
      this.client = new MongoClient(this.url, {
        serverSelectionTimeoutMS: this.serverSelectionTimeoutMS,
      });
      await this.client.connect();
      this.database = this.client.db(this.databaseName);
    }

    return this.database as Db;
  }

  public async getCollection<T extends Document>(
    collectionName: string,
  ): Promise<Collection<T>> {
    const database = await this.getDatabase();

    return database.collection<T>(collectionName);
  }

  public async close(): Promise<void> {
    await this.client?.close();
    this.client = undefined;
    this.database = undefined;
  }
}
