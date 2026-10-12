import DeviceSealedSecretPublisher from '@app/contexts/identity-devices/application/publish/DeviceSealedSecretPublisher';
import { PublishDeviceSealedSecretBundleMessage } from '@app/contexts/identity-devices/application/publish/messages/PublishDeviceSealedSecretBundleMessage';
import { DeviceAuthorization } from '@app/contexts/identity-devices/domain/DeviceAuthorization';
import { DeviceSealedSecretBundle } from '@app/contexts/identity-devices/domain/DeviceSealedSecretBundle';
import { DeviceAuthorizationNotFoundError } from '@app/contexts/identity-devices/domain/errors/DeviceAuthorizationNotFoundError';
import { DeviceSealedSecretGenerationStaleError } from '@app/contexts/identity-devices/domain/errors/DeviceSealedSecretGenerationStaleError';
import { DeviceSealedSecretRevisionMismatchError } from '@app/contexts/identity-devices/domain/errors/DeviceSealedSecretRevisionMismatchError';
import { InvalidDeviceSealedSecretBundleError } from '@app/contexts/identity-devices/domain/errors/InvalidDeviceSealedSecretBundleError';
import { DeviceAuthorizationRepository } from '@app/contexts/identity-devices/domain/repositories/DeviceAuthorizationRepository';
import { DeviceSealedSecretRepository } from '@app/contexts/identity-devices/domain/repositories/DeviceSealedSecretRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';

import {
  bundleOf,
  enrolledDeviceFixture,
  sealedEntry,
  singleDeviceFixture,
} from '../../DeviceSealedSecretFixtures';

class InMemoryDeviceSealedSecretRepository extends DeviceSealedSecretRepository {
  public readonly stored = new Map<string, DeviceSealedSecretBundle>();

  public async find(
    identityId: IdentityId,
  ): Promise<DeviceSealedSecretBundle | undefined> {
    return this.stored.get(identityId.valueOf());
  }

  public async replaceIfNewer(bundle: DeviceSealedSecretBundle): Promise<void> {
    const key = bundle.getIdentityId().valueOf();
    const current = this.stored.get(key);

    if (current && current.getGeneration() >= bundle.getGeneration()) {
      throw new DeviceSealedSecretGenerationStaleError();
    }
    this.stored.set(key, bundle);
  }
}

describe(DeviceSealedSecretPublisher.name, () => {
  let sealedSecrets: InMemoryDeviceSealedSecretRepository;

  beforeEach(() => {
    sealedSecrets = new InMemoryDeviceSealedSecretRepository();
  });

  function publisherFor(
    authorization: DeviceAuthorization | undefined,
  ): DeviceSealedSecretPublisher {
    const authorizations = {
      find: jest.fn().mockResolvedValue(authorization),
    } as unknown as DeviceAuthorizationRepository;

    return new DeviceSealedSecretPublisher(authorizations, sealedSecrets);
  }

  it('stores a bundle that matches the current authorization head', async () => {
    const { authorization, identityId, owner } = await singleDeviceFixture();
    const bundle = bundleOf({
      entries: [
        sealedEntry({
          authorizationRevision: 0,
          generation: 1,
          identityId,
          publisher: owner,
          recipient: owner,
        }),
      ],
      identityId,
      publisher: owner,
    });

    await publisherFor(authorization).publish(
      new PublishDeviceSealedSecretBundleMessage(bundle.toPrimitives()),
    );

    const stored = await sealedSecrets.find(new IdentityId(identityId));
    expect(stored?.getGeneration()).toBe(1);
    expect(stored?.getAuthorizationRevision()).toBe(0);
  });

  it('replaces the stored generation with a strictly newer one', async () => {
    const { authorization, identityId, owner } = await singleDeviceFixture();
    const publisher = publisherFor(authorization);
    const entryFor = (generation: number) =>
      sealedEntry({
        authorizationRevision: 0,
        generation,
        identityId,
        publisher: owner,
        recipient: owner,
      });

    await publisher.publish(
      new PublishDeviceSealedSecretBundleMessage(
        bundleOf({
          entries: [entryFor(1)],
          identityId,
          publisher: owner,
        }).toPrimitives(),
      ),
    );
    await publisher.publish(
      new PublishDeviceSealedSecretBundleMessage(
        bundleOf({
          entries: [entryFor(2)],
          generation: 2,
          identityId,
          publisher: owner,
        }).toPrimitives(),
      ),
    );

    const stored = await sealedSecrets.find(new IdentityId(identityId));
    expect(stored?.getGeneration()).toBe(2);
  });

  it('rejects a generation that does not advance the stored one and keeps the stored bundle', async () => {
    const { authorization, identityId, owner } = await singleDeviceFixture();
    const publisher = publisherFor(authorization);
    const first = bundleOf({
      entries: [
        sealedEntry({
          authorizationRevision: 0,
          generation: 1,
          identityId,
          publisher: owner,
          recipient: owner,
        }),
      ],
      identityId,
      publisher: owner,
    });
    await publisher.publish(
      new PublishDeviceSealedSecretBundleMessage(first.toPrimitives()),
    );

    const replay = bundleOf({
      entries: [
        sealedEntry({
          authorizationRevision: 0,
          generation: 1,
          identityId,
          publisher: owner,
          recipient: owner,
          sealedSecret: 'v2.x25519-hkdf-sha256-aes-256-gcm.b.c.d.e',
        }),
      ],
      identityId,
      publisher: owner,
    });

    await expect(
      publisher.publish(
        new PublishDeviceSealedSecretBundleMessage(replay.toPrimitives()),
      ),
    ).rejects.toThrow(DeviceSealedSecretGenerationStaleError);

    const stored = await sealedSecrets.find(new IdentityId(identityId));
    expect(stored?.toPrimitives()).toEqual(first.toPrimitives());
  });

  it('rejects a bundle built for a superseded authorization revision and stores nothing', async () => {
    const { authorization, identityId, owner } = await enrolledDeviceFixture();
    const stale = bundleOf({
      authorizationRevision: 0,
      entries: [
        sealedEntry({
          authorizationRevision: 0,
          generation: 1,
          identityId,
          publisher: owner,
          recipient: owner,
        }),
      ],
      identityId,
      publisher: owner,
    });

    await expect(
      publisherFor(authorization).publish(
        new PublishDeviceSealedSecretBundleMessage(stale.toPrimitives()),
      ),
    ).rejects.toThrow(DeviceSealedSecretRevisionMismatchError);
    expect(sealedSecrets.stored.size).toBe(0);
  });

  it('rejects a bundle addressed to an identity other than the authorization head', async () => {
    const { authorization, owner } = await singleDeviceFixture();
    const otherIdentity = (await KeyPair.generate()).toPrimitives().publicKey;
    const misaddressed = bundleOf({
      entries: [
        sealedEntry({
          authorizationRevision: 0,
          generation: 1,
          identityId: new IdentityId(otherIdentity).valueOf(),
          publisher: owner,
          recipient: owner,
        }),
      ],
      identityId: new IdentityId(otherIdentity).valueOf(),
      publisher: owner,
    });

    await expect(
      publisherFor(authorization).publish(
        new PublishDeviceSealedSecretBundleMessage(misaddressed.toPrimitives()),
      ),
    ).rejects.toThrow(InvalidDeviceSealedSecretBundleError);
    expect(sealedSecrets.stored.size).toBe(0);
  });

  it('fails without writing when the identity has no authorization', async () => {
    const { identityId, owner } = await singleDeviceFixture();
    const bundle = bundleOf({
      entries: [
        sealedEntry({
          authorizationRevision: 0,
          generation: 1,
          identityId,
          publisher: owner,
          recipient: owner,
        }),
      ],
      identityId,
      publisher: owner,
    });

    await expect(
      publisherFor(undefined).publish(
        new PublishDeviceSealedSecretBundleMessage(bundle.toPrimitives()),
      ),
    ).rejects.toThrow(DeviceAuthorizationNotFoundError);
    expect(sealedSecrets.stored.size).toBe(0);
  });
});
