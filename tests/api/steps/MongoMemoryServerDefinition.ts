import { AfterAll, BeforeAll } from '@cucumber/cucumber';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongoMemoryServer: MongoMemoryServer | undefined;

BeforeAll(async () => {
  mongoMemoryServer = await MongoMemoryServer.create();
  process.env.MONGO_URL = mongoMemoryServer.getUri();
  process.env.MONGO_DATABASE = 'pigeon_swarm_api_acceptance';
});

AfterAll(async () => {
  await mongoMemoryServer?.stop();
});
