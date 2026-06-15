import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import * as fs from 'fs/promises';
import os from 'os';
import path from 'path';

describe('EmbeddedLocalDatabase', () => {
  let databasePath: string;
  let firstDatabase: EmbeddedLocalDatabase;
  let secondDatabase: EmbeddedLocalDatabase;
  let previousLocalDatabasePath: string | undefined;

  beforeEach(async () => {
    previousLocalDatabasePath = process.env.PIGEON_LOCAL_DB_PATH;
    databasePath = await fs.mkdtemp(path.join(os.tmpdir(), 'pigeon-local-db-'));
    process.env.PIGEON_LOCAL_DB_PATH = databasePath;

    firstDatabase = new EmbeddedLocalDatabase();
    secondDatabase = new EmbeddedLocalDatabase();
  });

  afterEach(async () => {
    await firstDatabase.close();
    await secondDatabase.close();

    if (previousLocalDatabasePath === undefined) {
      delete process.env.PIGEON_LOCAL_DB_PATH;
    } else {
      process.env.PIGEON_LOCAL_DB_PATH = previousLocalDatabasePath;
    }

    await fs.rm(databasePath, { force: true, recursive: true });
  });

  it('should share the same open local database by path', async () => {
    await firstDatabase.save('nodes', 'node-1', {
      name: 'Node 1',
    });
    await secondDatabase.save('nodes', 'node-2', {
      name: 'Node 2',
    });

    await expect(secondDatabase.findOne('nodes', 'node-1')).resolves.toEqual({
      _id: 'node-1',
      name: 'Node 1',
    });
    await expect(firstDatabase.findOne('nodes', 'node-2')).resolves.toEqual({
      _id: 'node-2',
      name: 'Node 2',
    });
  });
});
