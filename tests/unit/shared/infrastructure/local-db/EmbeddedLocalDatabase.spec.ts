import EmbeddedLocalDatabase, {
  EmbeddedLocalDatabaseOperation,
} from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
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

  it('commits puts and deletes in one atomic batch', async () => {
    await firstDatabase.save('records', 'removed', { value: 'old' });

    await firstDatabase.commit([
      {
        type: 'put',
        namespace: 'records',
        id: 'first',
        document: { value: 'one' },
      },
      {
        type: 'put',
        namespace: 'records',
        id: 'second',
        document: { value: 'two' },
      },
      { type: 'del', namespace: 'records', id: 'removed' },
    ]);

    await expect(secondDatabase.findOne('records', 'first')).resolves.toEqual({
      _id: 'first',
      value: 'one',
    });
    await expect(secondDatabase.findOne('records', 'second')).resolves.toEqual({
      _id: 'second',
      value: 'two',
    });
    await expect(
      secondDatabase.findOne('records', 'removed'),
    ).resolves.toBeUndefined();
  });

  it('rejects duplicate keys before changing the database', async () => {
    const operations: EmbeddedLocalDatabaseOperation[] = [
      {
        type: 'put',
        namespace: 'records',
        id: 'same',
        document: { value: 'one' },
      },
      { type: 'del', namespace: 'records', id: 'same' },
    ];

    await expect(firstDatabase.commit(operations)).rejects.toThrow(
      'Duplicate local database batch key',
    );
    await expect(
      firstDatabase.findOne('records', 'same'),
    ).resolves.toBeUndefined();
  });

  it('leaves every prior value unchanged when Level rejects a batch', async () => {
    await firstDatabase.save('records', 'existing', { value: 'before' });

    await expect(
      firstDatabase.commit([
        {
          type: 'put',
          namespace: 'records',
          id: 'existing',
          document: { value: 'after' },
        },
        {
          type: 'put',
          namespace: 'records',
          id: 'invalid',
          document: { value: BigInt(1) },
        },
      ]),
    ).rejects.toThrow();
    await expect(
      secondDatabase.findOne('records', 'existing'),
    ).resolves.toEqual({ _id: 'existing', value: 'before' });
    await expect(
      secondDatabase.findOne('records', 'invalid'),
    ).resolves.toBeUndefined();
  });
});
