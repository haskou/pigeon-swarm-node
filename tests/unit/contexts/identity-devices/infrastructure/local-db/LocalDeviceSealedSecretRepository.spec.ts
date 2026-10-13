import { DeviceSealedSecretBundle } from '@app/contexts/identity-devices/domain/DeviceSealedSecretBundle';
import { DeviceSealedSecretGenerationStaleError } from '@app/contexts/identity-devices/domain/errors/DeviceSealedSecretGenerationStaleError';
import { DeviceSealedSecretNotFoundError } from '@app/contexts/identity-devices/domain/errors/DeviceSealedSecretNotFoundError';
import { InvalidDeviceSealedSecretBundleError } from '@app/contexts/identity-devices/domain/errors/InvalidDeviceSealedSecretBundleError';
import LocalDeviceSealedSecretRepository from '@app/contexts/identity-devices/infrastructure/local-db/LocalDeviceSealedSecretRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import * as fs from 'fs/promises';
import os from 'os';
import path from 'path';

import {
  bundleOf,
  sealedEntry,
  singleDeviceFixture,
  SingleDeviceFixture,
} from '../../DeviceSealedSecretFixtures';

describe(LocalDeviceSealedSecretRepository.name, () => {
  let databasePath: string;
  let database: EmbeddedLocalDatabase;
  let previousDatabasePath: string | undefined;

  beforeEach(async () => {
    previousDatabasePath = process.env.PIGEON_LOCAL_DB_PATH;
    databasePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'pigeon-device-sealed-secrets-'),
    );
    process.env.PIGEON_LOCAL_DB_PATH = databasePath;
    database = new EmbeddedLocalDatabase();
  });

  afterEach(async () => {
    await database.close();

    if (previousDatabasePath === undefined) {
      delete process.env.PIGEON_LOCAL_DB_PATH;
    } else {
      process.env.PIGEON_LOCAL_DB_PATH = previousDatabasePath;
    }
    await fs.rm(databasePath, { force: true, recursive: true });
  });

  function bundleAt(
    fixture: SingleDeviceFixture,
    generation: number,
    sealedSecret?: string,
  ): DeviceSealedSecretBundle {
    return bundleOf({
      entries: [
        sealedEntry({
          authorizationRevision: 0,
          generation,
          identityId: fixture.identityId,
          publisher: fixture.owner,
          recipient: fixture.owner,
          sealedSecret,
        }),
      ],
      generation,
      identityId: fixture.identityId,
      publisher: fixture.owner,
    });
  }

  it('reports an identity without a bundle as absent and rejects requiring it', async () => {
    const repository = new LocalDeviceSealedSecretRepository(database);
    const { identityId } = await singleDeviceFixture();

    await expect(repository.has(new IdentityId(identityId))).resolves.toBe(
      false,
    );
    await expect(
      repository.require(new IdentityId(identityId)),
    ).rejects.toThrow(DeviceSealedSecretNotFoundError);
  });

  it('rejects a malformed stored bundle', async () => {
    const repository = new LocalDeviceSealedSecretRepository(database);
    const { identityId } = await singleDeviceFixture();
    await database.save('device-sealed-secrets', identityId, {
      generation: 'not a number',
    });

    await expect(repository.has(new IdentityId(identityId))).resolves.toBe(
      true,
    );
    await expect(
      repository.require(new IdentityId(identityId)),
    ).rejects.toThrow(InvalidDeviceSealedSecretBundleError);
  });

  it('keeps the newest generation across a restart', async () => {
    const fixture = await singleDeviceFixture();
    const repository = new LocalDeviceSealedSecretRepository(database);
    await repository.replaceIfNewer(bundleAt(fixture, 1));
    const newest = bundleAt(fixture, 2);
    await repository.replaceIfNewer(newest);

    await database.close();
    database = new EmbeddedLocalDatabase();
    const reopened = new LocalDeviceSealedSecretRepository(database);

    const stored = await reopened.require(new IdentityId(fixture.identityId));
    expect(stored.toPrimitives()).toEqual(newest.toPrimitives());
  });

  it('admits exactly one of two concurrent writes at the same generation', async () => {
    const fixture = await singleDeviceFixture();
    const repository = new LocalDeviceSealedSecretRepository(database);
    const first = bundleAt(fixture, 1);
    const second = bundleAt(
      fixture,
      1,
      'v2.x25519-hkdf-sha256-aes-256-gcm.b.c.d.e',
    );

    const outcomes = await Promise.allSettled([
      repository.replaceIfNewer(first),
      repository.replaceIfNewer(second),
    ]);

    const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
    const rejected = outcomes.filter(
      (o): o is PromiseRejectedResult => o.status === 'rejected',
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(
      DeviceSealedSecretGenerationStaleError,
    );

    const stored = await repository.require(new IdentityId(fixture.identityId));
    const winners = [first, second].map((bundle) => bundle.toPrimitives());
    expect(winners).toContainEqual(stored.toPrimitives());
  });

  it('rejects an older generation once a newer one is stored', async () => {
    const fixture = await singleDeviceFixture();
    const repository = new LocalDeviceSealedSecretRepository(database);
    const newest = bundleAt(fixture, 3);
    await repository.replaceIfNewer(newest);

    await expect(
      repository.replaceIfNewer(bundleAt(fixture, 2)),
    ).rejects.toThrow(DeviceSealedSecretGenerationStaleError);

    const stored = await repository.require(new IdentityId(fixture.identityId));
    expect(stored.toPrimitives()).toEqual(newest.toPrimitives());
  });

  it('keeps bundles for different identities apart', async () => {
    const alpha = await singleDeviceFixture();
    const beta = await singleDeviceFixture();
    const repository = new LocalDeviceSealedSecretRepository(database);
    await repository.replaceIfNewer(bundleAt(alpha, 5));

    await expect(repository.has(new IdentityId(beta.identityId))).resolves.toBe(
      false,
    );
    const stored = await repository.require(new IdentityId(alpha.identityId));
    expect(stored.getGeneration().valueOf()).toBe(5);
  });
});
