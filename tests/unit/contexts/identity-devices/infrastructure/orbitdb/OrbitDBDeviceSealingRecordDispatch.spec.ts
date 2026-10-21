import OrbitDBDeviceSealingRecordRepository from '@app/contexts/identity-devices/infrastructure/orbitdb/OrbitDBDeviceSealingRecordRepository';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import {
  networkRegistryOf,
  PRIVATE_NETWORK,
  registryStoresOf,
} from '../../DeviceSealingRecordFixtures';

type HeadDocument = Record<string, unknown>;

const SEALING_PREFIX = 'device-sealing-record:';
const AUTHORIZATION_PREFIX = 'device-authorization:';
const SEALING_KEY = `${SEALING_PREFIX}identity-body:device-body:2026-05-02`;
const AUTHORIZATION_KEY = `${AUTHORIZATION_PREFIX}identity-body`;
const SEALING_VALUE: HeadDocument = {
  record: {
    deviceCredential: 'device-body',
    identityId: 'identity-body',
    sealingPublicKey: 'sealing-body',
    utcDay: '2026-05-02',
  },
  signature: 'signature-body',
};
const AUTHORIZATION_VALUE: HeadDocument = { authorization: {} };

function echoMerger() {
  return jest.fn(
    (_current: HeadDocument | undefined, candidate: HeadDocument) => candidate,
  );
}

describe('OrbitDB head dispatch for device sealing records', () => {
  let registry: OrbitDBReplicatedStateRegistry;

  beforeEach(async () => {
    registry = new OrbitDBReplicatedStateRegistry();
    await registry.register(PRIVATE_NETWORK, registryStoresOf());
  });

  afterEach(() => {
    registry.clear();
    jest.restoreAllMocks();
  });

  it('passes the head key to the merger registered for its prefix', () => {
    const merger = echoMerger();
    registry.registerHeadRecordMerger(SEALING_PREFIX, merger);

    registry.cacheHeadLocally(SEALING_KEY, SEALING_VALUE);

    expect(merger).toHaveBeenCalledWith(undefined, SEALING_VALUE, SEALING_KEY);
  });

  it('never sends a sealing key to the device authorization merger', () => {
    const authorizationMerger = echoMerger();
    const sealingMerger = echoMerger();
    registry.registerHeadRecordMerger(AUTHORIZATION_PREFIX, authorizationMerger);
    registry.registerHeadRecordMerger(SEALING_PREFIX, sealingMerger);

    registry.cacheHeadLocally(SEALING_KEY, SEALING_VALUE);

    expect(authorizationMerger).not.toHaveBeenCalled();
    expect(sealingMerger).toHaveBeenCalledTimes(1);
  });

  it('never sends a device authorization key to the sealing merger', () => {
    const authorizationMerger = echoMerger();
    const sealingMerger = echoMerger();
    registry.registerHeadRecordMerger(AUTHORIZATION_PREFIX, authorizationMerger);
    registry.registerHeadRecordMerger(SEALING_PREFIX, sealingMerger);

    registry.cacheHeadLocally(AUTHORIZATION_KEY, AUTHORIZATION_VALUE);

    expect(sealingMerger).not.toHaveBeenCalled();
    expect(authorizationMerger).toHaveBeenCalledTimes(1);
  });

  it('does not throw out of the registry merge path for a malformed sealing record', () => {
    new OrbitDBDeviceSealingRecordRepository(registry, networkRegistryOf());

    expect(() =>
      registry.cacheHeadLocally(SEALING_KEY, { record: 'malformed' }),
    ).not.toThrow();
    expect(registry.findCachedHead(SEALING_KEY)).toBeUndefined();
  });
});
