import { PrivateBlobNotFoundError } from '@app/contexts/private-blobs/domain/errors/PrivateBlobNotFoundError';
import LocalPrivateBlobRepository from '@app/contexts/private-blobs/infrastructure/local-db/LocalPrivateBlobRepository';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

describe('LocalPrivateBlobRepository', () => {
  const previousPath = process.env.PIGEON_LOCAL_DB_PATH;
  let databasePath: string;
  let database: EmbeddedLocalDatabase;
  let repository: LocalPrivateBlobRepository;

  beforeEach(async () => {
    databasePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'pigeon-private-blobs-'),
    );
    process.env.PIGEON_LOCAL_DB_PATH = databasePath;
    database = new EmbeddedLocalDatabase();
    repository = new LocalPrivateBlobRepository(database);
  });

  afterEach(async () => {
    await database.close();

    if (previousPath === undefined) {
      delete process.env.PIGEON_LOCAL_DB_PATH;
    } else {
      process.env.PIGEON_LOCAL_DB_PATH = previousPath;
    }
    await fs.rm(databasePath, { force: true, recursive: true });
  });

  it('reports an unknown blob as absent and rejects requiring it', async () => {
    await expect(repository.hasById('missing')).resolves.toBe(false);
    await expect(repository.requireById('missing')).rejects.toBeInstanceOf(
      PrivateBlobNotFoundError,
    );
  });

  it('rejects a malformed stored blob', async () => {
    await database.save('private_blobs', 'broken', {
      id: 'broken',
      size: 'not a number',
    });

    await expect(repository.hasById('broken')).resolves.toBe(true);
    await expect(repository.requireById('broken')).rejects.toThrow(
      'Stored private blob is malformed.',
    );
  });
});
