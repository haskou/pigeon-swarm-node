import { IdentityAdmissionDifficulty } from '@app/contexts/identities/domain/value-objects/IdentityAdmissionDifficulty';
import { IdentityExternalIdentifier } from '@app/contexts/identities/domain/value-objects/IdentityExternalIdentifier';
import LocalIdentityAdmissionLoadRepository from '@app/contexts/identities/infrastructure/local-db/LocalIdentityAdmissionLoadRepository';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import * as fs from 'fs/promises';
import os from 'os';
import path from 'path';

const NETWORK = new NetworkId('550e8400-e29b-41d4-a716-446655440000');
const OTHER_NETWORK = new NetworkId('550e8400-e29b-41d4-a716-446655440001');
const FIRST = new IdentityExternalIdentifier('bafkfirst');
const SECOND = new IdentityExternalIdentifier('bafksecond');
const WINDOW_MS = 60_000;
const HORIZON = IdentityAdmissionDifficulty.FRESHNESS_HORIZON_MS;

describe(LocalIdentityAdmissionLoadRepository.name, () => {
  let databasePath: string;
  let database: EmbeddedLocalDatabase;
  let previousDatabasePath: string | undefined;
  let repository: LocalIdentityAdmissionLoadRepository;
  let now: number;

  function travel(milliseconds: number): void {
    now += milliseconds;
  }

  beforeEach(async () => {
    previousDatabasePath = process.env.PIGEON_LOCAL_DB_PATH;
    databasePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'pigeon-identity-admission-load-'),
    );
    process.env.PIGEON_LOCAL_DB_PATH = databasePath;
    database = new EmbeddedLocalDatabase();
    repository = new LocalIdentityAdmissionLoadRepository(database);
    now = 1_773_848_829_055;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await database.close();

    if (previousDatabasePath === undefined) {
      delete process.env.PIGEON_LOCAL_DB_PATH;
    } else {
      process.env.PIGEON_LOCAL_DB_PATH = previousDatabasePath;
    }
    await fs.rm(databasePath, { force: true, recursive: true });
  });

  it('counts nothing for a network it has not seen', async () => {
    await expect(repository.countRecent(NETWORK)).resolves.toBe(0);
  });

  it('counts each published version once per network it enters', async () => {
    await repository.record(FIRST, [NETWORK, OTHER_NETWORK]);
    await repository.record(SECOND, [NETWORK]);

    await expect(repository.countRecent(NETWORK)).resolves.toBe(2);
    await expect(repository.countRecent(OTHER_NETWORK)).resolves.toBe(1);
  });

  it('forgets the count once the window has elapsed', async () => {
    await repository.record(FIRST, [NETWORK]);
    travel(WINDOW_MS);

    await expect(repository.countRecent(NETWORK)).resolves.toBe(0);
  });

  it('does not recount a version replicated back after it was charged', async () => {
    await repository.record(FIRST, [NETWORK]);
    travel(WINDOW_MS);
    await repository.record(FIRST, [NETWORK]);
    travel(HORIZON);
    await repository.record(FIRST, [NETWORK]);

    await expect(repository.countRecent(NETWORK)).resolves.toBe(0);
  });

  it('counts a version again only for a network it was not charged in', async () => {
    await repository.record(FIRST, [NETWORK]);
    await repository.record(FIRST, [NETWORK, OTHER_NETWORK]);

    await expect(repository.countRecent(NETWORK)).resolves.toBe(1);
    await expect(repository.countRecent(OTHER_NETWORK)).resolves.toBe(1);
  });

  it('counts concurrent sightings of the same version once', async () => {
    await Promise.all([
      repository.record(FIRST, [NETWORK]),
      repository.record(FIRST, [NETWORK]),
      repository.record(FIRST, [NETWORK]),
    ]);

    await expect(repository.countRecent(NETWORK)).resolves.toBe(1);
  });

  it('prunes sightings that can no longer be fresh when a window opens', async () => {
    await repository.record(FIRST, [NETWORK]);
    travel(2 * HORIZON + 1);
    await repository.record(SECOND, [NETWORK]);

    const sightings = await database.find(
      LocalIdentityAdmissionLoadRepository.OBSERVED_NAMESPACE,
    );

    expect(sightings.map((sighting) => sighting._id)).toEqual([
      `${NETWORK.valueOf()}:${SECOND.valueOf()}`,
    ]);
  });
});
