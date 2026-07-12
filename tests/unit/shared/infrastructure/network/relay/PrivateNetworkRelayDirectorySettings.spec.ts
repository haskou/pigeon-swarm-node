import PrivateNetworkRelayDirectorySettings from '@app/shared/infrastructure/network/relay/PrivateNetworkRelayDirectorySettings';

describe('PrivateNetworkRelayDirectorySettings', () => {
  let settings: PrivateNetworkRelayDirectorySettings;

  beforeEach(() => {
    jest.replaceProperty(process, 'env', { ...process.env });
    settings = new PrivateNetworkRelayDirectorySettings();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses the protocol defaults when intervals are not configured', () => {
    delete process.env.PIGEON_RELAY_RECORD_PUBLICATION_INTERVAL_MS;
    delete process.env.PIGEON_PRIVATE_RELAY_RECORD_REFRESH_SECONDS;
    delete process.env.PIGEON_RELAY_RECORD_TTL_MS;

    expect(settings.getPublicationIntervalMs()).toBe(60 * 60_000);
    expect(settings.getRelayRecordTtlMs()).toBe(2 * 60 * 60_000);
  });

  it('prefers the publication interval in milliseconds', () => {
    process.env.PIGEON_RELAY_RECORD_PUBLICATION_INTERVAL_MS = '45000';
    process.env.PIGEON_PRIVATE_RELAY_RECORD_REFRESH_SECONDS = '90';

    expect(settings.getPublicationIntervalMs()).toBe(45_000);
  });

  it('supports the previous publication interval in seconds', () => {
    delete process.env.PIGEON_RELAY_RECORD_PUBLICATION_INTERVAL_MS;
    process.env.PIGEON_PRIVATE_RELAY_RECORD_REFRESH_SECONDS = '90';

    expect(settings.getPublicationIntervalMs()).toBe(90_000);
  });

  it('bounds the wait for public peers', () => {
    process.env.PIGEON_RELAY_RECORD_PUBLIC_PEER_WAIT_MS = '25000';

    expect(settings.getPublicPeerWaitMs()).toBe(10_000);
  });

  it('uses the relay dial timeout before generic routing timeouts', () => {
    process.env.PIGEON_PRIVATE_RELAY_DIAL_TIMEOUT_MS = '3000';
    process.env.PIGEON_RELAY_DIRECTORY_ROUTING_TIMEOUT_MS = '6000';
    process.env.PIGEON_IPFS_ROUTING_RECORD_TIMEOUT_MS = '9000';

    expect(settings.getPrivateRelayDialTimeoutMs()).toBe(3000);
  });

  it('uses safe defaults for invalid positive durations', () => {
    process.env.PIGEON_PRIVATE_RELAY_CONNECTION_GRACE_MS = '0';
    process.env.PIGEON_RELAY_RECORD_CONNECTED_DISCOVERY_INTERVAL_MS = '-1';
    process.env.PIGEON_PRIVATE_RELAY_CONNECTED_DISCOVERY_INTERVAL_MS = '0';

    expect(settings.getActiveConnectionGraceMs()).toBe(60_000);
    expect(settings.getActiveDiscoveryIntervalMs()).toBe(5 * 60_000);
  });
});
