import EmbeddedLocalDatabase, {
  EmbeddedLocalDatabaseOperation,
} from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import LocalDatabaseIsLockedError from '@app/shared/infrastructure/local-db/LocalDatabaseIsLockedError';
import LocalDatabaseSectionIsNestedError from '@app/shared/infrastructure/local-db/LocalDatabaseSectionIsNestedError';
import * as fs from 'fs/promises';
import { Level } from 'level';
import os from 'os';
import path from 'path';
import { setTimeout } from 'timers/promises';

/** Settles like `pending`, or rejects once it waited a second, never hangs. */
const withinASecond = async <T>(pending: Promise<T>): Promise<T> =>
  Promise.race([
    pending,
    setTimeout(1000, undefined, { ref: false }).then((): never => {
      throw new Error('Still waiting after a second');
    }),
  ]);

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
        document: { value: 'one' },
        id: 'first',
        namespace: 'records',
        type: 'put',
      },
      {
        document: { value: 'two' },
        id: 'second',
        namespace: 'records',
        type: 'put',
      },
      { id: 'removed', namespace: 'records', type: 'del' },
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
        document: { value: 'one' },
        id: 'same',
        namespace: 'records',
        type: 'put',
      },
      { id: 'same', namespace: 'records', type: 'del' },
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
          document: { value: 'after' },
          id: 'existing',
          namespace: 'records',
          type: 'put',
        },
        {
          document: { value: BigInt(1) },
          id: 'invalid',
          namespace: 'records',
          type: 'put',
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

  it('should refuse at once a section entered from inside a section of the same scope, on any handle', async () => {
    const nested = jest.fn();

    await firstDatabase.exclusively('scope', async () => {
      await expect(
        withinASecond(secondDatabase.exclusively('scope', nested)),
      ).rejects.toThrow(LocalDatabaseSectionIsNestedError);
    });

    expect(nested).not.toHaveBeenCalled();
    await expect(
      withinASecond(
        secondDatabase.exclusively('scope', () => Promise.resolve('free')),
      ),
    ).resolves.toBe('free');
  });

  it('should name no scope or id in the refusal', async () => {
    const refusal = firstDatabase.exclusively('identity-123', () =>
      firstDatabase.exclusively('identity-123', () =>
        Promise.resolve('nested'),
      ),
    );

    await expect(withinASecond(refusal)).rejects.toMatchObject({
      message:
        'A local database section cannot be entered again from inside itself.',
    });
  });

  it('should let a section of another scope run inside a section', async () => {
    await expect(
      withinASecond(
        firstDatabase.exclusively('outer', () =>
          secondDatabase.exclusively('inner', () => Promise.resolve('inner')),
        ),
      ),
    ).resolves.toBe('inner');
  });

  it('should queue, not refuse, work a section started that enters it after the section ended', async () => {
    const { promise: ended, resolve: end } = Promise.withResolvers<void>();
    const enter = (): Promise<string> =>
      firstDatabase.exclusively('scope', () => Promise.resolve('queued'));
    let later!: Promise<string>;

    await firstDatabase.exclusively('scope', () => {
      later = ended.then(enter);

      return Promise.resolve();
    });
    end();

    await expect(withinASecond(later)).resolves.toBe('queued');
  });

  describe('when another process holds the database', () => {
    let lockedPath: string;
    let runningNode: Level<string, Record<string, unknown>>;
    let lockedDatabase: EmbeddedLocalDatabase;

    beforeEach(async () => {
      lockedPath = await fs.mkdtemp(
        path.join(os.tmpdir(), 'pigeon-locked-local-db-'),
      );
      runningNode = new Level(lockedPath, { valueEncoding: 'json' });
      await runningNode.open();
      await runningNode.put('nodes:node-1', { name: 'Node 1' });
      process.env.PIGEON_LOCAL_DB_PATH = lockedPath;
      lockedDatabase = new EmbeddedLocalDatabase();
    });

    afterEach(async () => {
      await lockedDatabase.close();
      await runningNode.close();
      await fs.rm(lockedPath, { force: true, recursive: true });
    });

    it('should explain that the database is in use instead of failing obscurely', async () => {
      const failure = lockedDatabase.findOne('nodes', 'node-1');

      await expect(failure).rejects.toBeInstanceOf(LocalDatabaseIsLockedError);
      await expect(failure).rejects.toThrow(
        `The local database at ${lockedPath} is in use by another process, such as a running node.`,
      );
    });

    it('should fail every attempt while the lock is held', async () => {
      await expect(lockedDatabase.findOne('nodes', 'node-1')).rejects.toThrow(
        LocalDatabaseIsLockedError,
      );
      await expect(
        lockedDatabase.save('nodes', 'node-2', { name: 'Node 2' }),
      ).rejects.toThrow(LocalDatabaseIsLockedError);
    });

    it('should open once the other process has released the database', async () => {
      await expect(lockedDatabase.findOne('nodes', 'node-1')).rejects.toThrow(
        LocalDatabaseIsLockedError,
      );

      await runningNode.close();

      await expect(lockedDatabase.findOne('nodes', 'node-1')).resolves.toEqual({
        name: 'Node 1',
      });
    });
  });
});
