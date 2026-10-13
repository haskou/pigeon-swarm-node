import { IdentityAdmissionDifficulty } from '@app/contexts/identities/domain/value-objects/IdentityAdmissionDifficulty';
import LocalIdentityAdmissionLoadRepository from '@app/contexts/identities/infrastructure/local-db/LocalIdentityAdmissionLoadRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import { generateKeyPairSync } from 'crypto';
import * as fs from 'fs/promises';
import os from 'os';
import path from 'path';

const NETWORK = new NetworkId('550e8400-e29b-41d4-a716-446655440000');
const OTHER_NETWORK = new NetworkId('550e8400-e29b-41d4-a716-446655440001');
const WINDOW_MS = 60_000;
const HORIZON = IdentityAdmissionDifficulty.FRESHNESS_HORIZON_MS;
const SATURATING = IdentityAdmissionDifficulty.SATURATING_ADMISSIONS_PER_WINDOW;

function identityId(): IdentityId {
  return new IdentityId(
    generateKeyPairSync('ed25519')
      .publicKey.export({ format: 'pem', type: 'spki' })
      .toString(),
  );
}

function networkId(index: number): NetworkId {
  return new NetworkId(
    `550e8400-e29b-41d4-a716-${index.toString().padStart(12, '0')}`,
  );
}

describe(LocalIdentityAdmissionLoadRepository.name, () => {
  const FIRST = identityId();
  const SECOND = identityId();
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

  it('counts each identity once per network it enters', async () => {
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

  it('does not recount an identity while its sighting can still be fresh', async () => {
    await repository.record(FIRST, [NETWORK]);
    travel(WINDOW_MS);
    await repository.record(FIRST, [NETWORK]);
    travel(HORIZON);
    await repository.record(FIRST, [NETWORK]);

    await expect(repository.countRecent(NETWORK)).resolves.toBe(0);
  });

  it('counts an identity again only for a network it was not counted in', async () => {
    await repository.record(FIRST, [NETWORK]);
    await repository.record(FIRST, [NETWORK, OTHER_NETWORK]);

    await expect(repository.countRecent(NETWORK)).resolves.toBe(1);
    await expect(repository.countRecent(OTHER_NETWORK)).resolves.toBe(1);
  });

  it('counts concurrent sightings of the same identity once', async () => {
    await Promise.all([
      repository.record(FIRST, [NETWORK]),
      repository.record(FIRST, [NETWORK]),
      repository.record(FIRST, [NETWORK]),
    ]);

    await expect(repository.countRecent(NETWORK)).resolves.toBe(1);
  });

  it('stops counting and remembering a network once its price is saturated', async () => {
    for (let admission = 0; admission <= SATURATING; admission++) {
      await repository.record(identityId(), [NETWORK]);
    }

    await expect(repository.countRecent(NETWORK)).resolves.toBe(SATURATING);
    await expect(
      database.find(LocalIdentityAdmissionLoadRepository.OBSERVED_NAMESPACE),
    ).resolves.toHaveLength(SATURATING);
  });

  it('prunes expired sightings and windows once per window', async () => {
    await repository.record(FIRST, [NETWORK]);
    await repository.record(SECOND, [OTHER_NETWORK]);
    travel(2 * HORIZON + 1);
    await repository.record(SECOND, [NETWORK]);

    const sightings = await database.find(
      LocalIdentityAdmissionLoadRepository.OBSERVED_NAMESPACE,
    );
    const windows = await database.find(
      LocalIdentityAdmissionLoadRepository.NAMESPACE,
    );

    expect(sightings.map((sighting) => sighting._id)).toEqual([
      `${NETWORK.valueOf()}:${SECOND.valueOf()}`,
    ]);
    expect(windows.map((window) => window._id)).toEqual([NETWORK.valueOf()]);
  });

  it('drops sightings beyond the pending bound instead of queueing them', async () => {
    const bound = LocalIdentityAdmissionLoadRepository.MAX_PENDING_RECORDS;
    const networks = Array.from({ length: bound + 10 }, (_, index) =>
      networkId(index),
    );

    await Promise.all(
      networks.map((network) => repository.record(FIRST, [network])),
    );

    await expect(
      database.find(LocalIdentityAdmissionLoadRepository.OBSERVED_NAMESPACE),
    ).resolves.toHaveLength(bound);
  });
});
