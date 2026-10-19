import { DEVICE_SEALING_RECORD_HEAD_PREFIX } from '@app/contexts/identity-devices/domain/DeviceSealingRecord';
import { DeviceSealingRecordConflictError } from '@app/contexts/identity-devices/domain/errors/DeviceSealingRecordConflictError';
import { DeviceSealingRecordRejectedError } from '@app/contexts/identity-devices/domain/errors/DeviceSealingRecordRejectedError';
import OrbitDBDeviceSealingRecordRepository from '@app/contexts/identity-devices/infrastructure/orbitdb/OrbitDBDeviceSealingRecordRepository';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';

import {
  credentialOf,
  singleDeviceFixture,
  SingleDeviceFixture,
} from '../../DeviceSealedSecretFixtures';
import {
  networkRegistryOf,
  NOW,
  PRIVATE_NETWORK,
  PUBLIC_NETWORK,
  registryStoresOf,
  sealingPublicKeyOf,
  sealingRecordOf,
  signedRecordPrimitives,
  TODAY,
  YESTERDAY,
} from '../../DeviceSealingRecordFixtures';

const OTHER_HEAD_PREFIXES = [
  'keychain:',
  'keychain-cid:',
  'identity:',
  'identity-handle:',
  'device-authorization:',
  'conversation-operation-index:',
  'community-operation-index:',
  'notification:',
  'sticker-pack:',
  'notification-recipient-index:',
  'missed-call:',
  'invitation:',
];

describe('OrbitDBDeviceSealingRecordRepository', () => {
  let registry: OrbitDBReplicatedStateRegistry;
  let registerSpy: jest.SpyInstance;
  let repository: OrbitDBDeviceSealingRecordRepository;
  let fixture: SingleDeviceFixture;
  let stranger: KeyPair;
  let authorizationKey: string;

  beforeEach(async () => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW.getTime());
    fixture = await singleDeviceFixture();
    stranger = await KeyPair.generate();
    registry = new OrbitDBReplicatedStateRegistry();
    await registry.register(PRIVATE_NETWORK, registryStoresOf());
    authorizationKey = `device-authorization:${fixture.identityId}`;
    registry.cacheHeadLocally(authorizationKey, {
      authorization: fixture.authorization.toPrimitives(),
    });
    registerSpy = jest.spyOn(registry, 'registerHeadRecordMerger');
    repository = new OrbitDBDeviceSealingRecordRepository(
      registry,
      networkRegistryOf(),
    );
  });

  afterEach(() => {
    registry.clear();
    jest.restoreAllMocks();
  });

  function headKeyOf(
    identityId: string,
    deviceCredential: string,
    utcDay: string,
  ): string {
    return `${DEVICE_SEALING_RECORD_HEAD_PREFIX}${identityId}:${deviceCredential}:${utcDay}`;
  }

  function mergerOf(): (
    current: Record<string, unknown> | undefined,
    candidate: Record<string, unknown>,
    key: string,
  ) => Record<string, unknown> | undefined {
    const [, merger] = registerSpy.mock.calls[0];

    return merger;
  }

  it('publishes an admitted record under its device sealing head key', async () => {
    const record = sealingRecordOf({
      identityId: fixture.identityId,
      signer: fixture.owner,
    });

    await repository.publish(record);

    expect(registry.findCachedHead(record.key())).toEqual(
      record.toPrimitives(),
    );
  });

  it('writes the record only to the private network', async () => {
    const putSpy = jest.spyOn(registry, 'putHead');
    const record = sealingRecordOf({
      identityId: fixture.identityId,
      signer: fixture.owner,
    });

    await repository.publish(record);

    expect(putSpy).toHaveBeenCalledWith(
      record.key(),
      record.toPrimitives(),
      [PRIVATE_NETWORK],
    );
  });

  it('does not write again when the same record is published twice', async () => {
    const putSpy = jest.spyOn(registry, 'putHead');
    const record = sealingRecordOf({
      identityId: fixture.identityId,
      signer: fixture.owner,
    });

    await repository.publish(record);
    await repository.publish(record);

    expect(putSpy).toHaveBeenCalledTimes(1);
  });

  it('refuses a second sealing key for the same device and day', async () => {
    await repository.publish(
      sealingRecordOf({
        identityId: fixture.identityId,
        signer: fixture.owner,
        sealingPublicKey: sealingPublicKeyOf(1),
      }),
    );

    await expect(
      repository.publish(
        sealingRecordOf({
          identityId: fixture.identityId,
          signer: fixture.owner,
          sealingPublicKey: sealingPublicKeyOf(2),
        }),
      ),
    ).rejects.toThrow(DeviceSealingRecordConflictError);
  });

  it('refuses a record signed by a credential that is not authorised', async () => {
    await expect(
      repository.publish(
        sealingRecordOf({
          identityId: fixture.identityId,
          signer: stranger,
        }),
      ),
    ).rejects.toThrow(DeviceSealingRecordRejectedError);
  });

  it('refuses a record for an identity without any device authorization', async () => {
    await expect(
      repository.publish(
        sealingRecordOf({
          identityId: credentialOf(stranger),
          signer: stranger,
        }),
      ),
    ).rejects.toThrow(DeviceSealingRecordRejectedError);
  });

  it('refuses a record dated before yesterday', async () => {
    await expect(
      repository.publish(
        sealingRecordOf({
          identityId: fixture.identityId,
          signer: fixture.owner,
          utcDay: '2026-04-30',
        }),
      ),
    ).rejects.toThrow(DeviceSealingRecordRejectedError);
  });

  it('registers the sealing head merger for the sealing prefix only', () => {
    expect(registerSpy).toHaveBeenCalledTimes(1);
    expect(registerSpy.mock.calls[0][0]).toBe(DEVICE_SEALING_RECORD_HEAD_PREFIX);
  });

  it('scopes sealing heads to private networks', () => {
    const scope = registerSpy.mock.calls[0][2];
    const value = { record: {}, signature: 'x' };

    expect(scope?.(PRIVATE_NETWORK, value)).toBe(value);
    expect(scope?.(PUBLIC_NETWORK, value)).toBeUndefined();
  });

  it('merger admits a record filed under its own key', () => {
    const record = sealingRecordOf({
      identityId: fixture.identityId,
      signer: fixture.owner,
    });

    expect(
      mergerOf()(undefined, record.toPrimitives(), record.key()),
    ).toEqual(record.toPrimitives());
  });

  it('merger refuses a record filed under another key', () => {
    const record = sealingRecordOf({
      identityId: fixture.identityId,
      signer: fixture.owner,
    });

    expect(
      mergerOf()(
        undefined,
        record.toPrimitives(),
        headKeyOf(fixture.identityId, credentialOf(fixture.owner), YESTERDAY),
      ),
    ).toBeUndefined();
  });

  it('merger keeps the first admitted record when a second sealing key arrives', () => {
    const first = sealingRecordOf({
      identityId: fixture.identityId,
      signer: fixture.owner,
      sealingPublicKey: sealingPublicKeyOf(1),
    });
    const second = sealingRecordOf({
      identityId: fixture.identityId,
      signer: fixture.owner,
      sealingPublicKey: sealingPublicKeyOf(2),
    });

    expect(
      mergerOf()(first.toPrimitives(), second.toPrimitives(), first.key()),
    ).toEqual(first.toPrimitives());
  });

  it('merger refuses a record whose device is not authorised', () => {
    const record = sealingRecordOf({
      identityId: fixture.identityId,
      signer: stranger,
    });

    expect(
      mergerOf()(undefined, record.toPrimitives(), record.key()),
    ).toBeUndefined();
  });

  it('merger refuses a malformed candidate without throwing', () => {
    const malformed = { junk: true };

    expect(() =>
      mergerOf()(undefined, malformed, headKeyOf('a', 'b', TODAY)),
    ).not.toThrow();
    expect(
      mergerOf()(undefined, malformed, headKeyOf('a', 'b', TODAY)),
    ).toBeUndefined();
  });

  it('lists the admitted records for today and yesterday only', async () => {
    await repository.publish(
      sealingRecordOf({
        identityId: fixture.identityId,
        signer: fixture.owner,
        utcDay: TODAY,
      }),
    );
    await repository.publish(
      sealingRecordOf({
        identityId: fixture.identityId,
        signer: fixture.owner,
        utcDay: YESTERDAY,
      }),
    );
    registry.cacheHeadLocally(
      headKeyOf(fixture.identityId, credentialOf(fixture.owner), '2026-04-30'),
      signedRecordPrimitives({
        identityId: fixture.identityId,
        signer: fixture.owner,
        utcDay: '2026-04-30',
      }),
    );

    expect(
      repository
        .findCurrent(fixture.identityId)
        .map((record) => record.getUtcDay())
        .sort(),
    ).toEqual([YESTERDAY, TODAY]);
  });

  it('keeps the sealing head namespace disjoint from the other head prefixes', () => {
    for (const prefix of OTHER_HEAD_PREFIXES) {
      expect(DEVICE_SEALING_RECORD_HEAD_PREFIX.startsWith(prefix)).toBe(false);
      expect(prefix.startsWith(DEVICE_SEALING_RECORD_HEAD_PREFIX)).toBe(false);
    }
  });

  it('creates no identity alias for a published record', async () => {
    await repository.publish(
      sealingRecordOf({
        identityId: fixture.identityId,
        signer: fixture.owner,
      }),
    );

    expect(registry.findCachedHeadsByPrefix('identity:')).toEqual([]);
    expect(registry.findCachedHead(fixture.identityId)).toBeUndefined();
  });

  it('leaves the device authorization head unchanged after publishing', async () => {
    const before = registry.findCachedHead(authorizationKey);

    await repository.publish(
      sealingRecordOf({
        identityId: fixture.identityId,
        signer: fixture.owner,
      }),
    );

    expect(registry.findCachedHead(authorizationKey)).toEqual(before);
  });
});
