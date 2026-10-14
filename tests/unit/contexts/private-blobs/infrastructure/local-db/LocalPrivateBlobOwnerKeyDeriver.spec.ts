import LocalPrivateBlobOwnerKeyDeriver from '@app/contexts/private-blobs/infrastructure/local-db/LocalPrivateBlobOwnerKeyDeriver';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

const ALICE = new IdentityId(
  'MCowBQYDK2VwAyEAFuQGsm0WcnE4FhQecwAFGeTfQCZzEMuhE73CyTUxOio=',
);
const BOB = new IdentityId(
  'MCowBQYDK2VwAyEAKV3uU7LZg0grhngWKkoR9jqZo5M3yQ2GHliIFMgdJZw=',
);

describe('LocalPrivateBlobOwnerKeyDeriver', () => {
  const previousPath = process.env.PIGEON_LOCAL_DB_PATH;
  let databasePath: string;
  let database: EmbeddedLocalDatabase;

  beforeEach(async () => {
    databasePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'pigeon-private-blob-owner-'),
    );
    process.env.PIGEON_LOCAL_DB_PATH = databasePath;
    database = new EmbeddedLocalDatabase();
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

  it('derives the same key for the same identity', async () => {
    const deriver = new LocalPrivateBlobOwnerKeyDeriver(database);

    await expect(deriver.derive(ALICE)).resolves.toEqual(
      await deriver.derive(ALICE),
    );
  });

  it('derives different keys for different identities', async () => {
    const deriver = new LocalPrivateBlobOwnerKeyDeriver(database);

    await expect(deriver.derive(ALICE)).resolves.not.toEqual(
      await deriver.derive(BOB),
    );
  });

  it('keeps keys stable across instances sharing the database', async () => {
    const first = await new LocalPrivateBlobOwnerKeyDeriver(database).derive(
      ALICE,
    );

    await expect(
      new LocalPrivateBlobOwnerKeyDeriver(database).derive(ALICE),
    ).resolves.toEqual(first);
  });

  it('never exposes the raw identity id as the key', async () => {
    const key = await new LocalPrivateBlobOwnerKeyDeriver(database).derive(
      ALICE,
    );

    expect(key.valueOf()).not.toContain(ALICE.valueOf());
  });
});
