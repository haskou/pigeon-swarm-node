import { PublicRelayConfiguration } from '../../../../../../src/shared/infrastructure/network/relay/PublicRelayConfiguration';

describe('PublicRelayConfiguration', () => {
  it('should disable relay by default', () => {
    const configuration = PublicRelayConfiguration.fromEnvironment({});

    expect(configuration.isRelayEnabled()).toBe(false);
    expect(configuration.isRelayAutoEnabled()).toBe(false);
    expect(configuration.getLibp2pPort()).toBe(4001);
    expect(configuration.getRelayPort()).toBe(4011);
    expect(configuration.hasPublicHost()).toBe(false);
    expect(configuration.isRelayDiscoveryEnabled()).toBe(true);
    expect(configuration.getRelayRecordTtlMs()).toBe(300000);
    expect(configuration.getBootstrapRelayMultiaddrs()).toEqual([]);
  });

  it('should read relay environment settings', () => {
    const configuration = PublicRelayConfiguration.fromEnvironment({
      PIGEON_BOOTSTRAP_RELAY_MULTIADDRS:
        ' /dns4/relay-a.test/tcp/4011/p2p/12D3A, /ip4/203.0.113.7/tcp/4011/p2p/12D3B ',
      PIGEON_LIBP2P_PORT: '4101',
      PIGEON_PUBLIC_HOST: 'relay.example.com',
      PIGEON_RELAY_AUTO_ENABLE: 'true',
      PIGEON_RELAY_DISCOVERY_ENABLED: 'false',
      PIGEON_RELAY_ENABLED: 'true',
      PIGEON_RELAY_PORT: '4111',
      PIGEON_RELAY_RECORD_TTL_SECONDS: '120',
    });

    expect(configuration.isRelayEnabled()).toBe(true);
    expect(configuration.isRelayAutoEnabled()).toBe(true);
    expect(configuration.getLibp2pPort()).toBe(4101);
    expect(configuration.getRelayPort()).toBe(4111);
    expect(configuration.getPublicHost()).toBe('relay.example.com');
    expect(configuration.hasPublicHost()).toBe(true);
    expect(configuration.isRelayDiscoveryEnabled()).toBe(false);
    expect(configuration.getRelayRecordTtlMs()).toBe(120000);
    expect(configuration.getBootstrapRelayMultiaddrs()).toEqual([
      '/dns4/relay-a.test/tcp/4011/p2p/12D3A',
      '/ip4/203.0.113.7/tcp/4011/p2p/12D3B',
    ]);
  });

  it('should return a defensive copy of bootstrap relay multiaddrs', () => {
    const configuration = PublicRelayConfiguration.fromEnvironment({
      PIGEON_BOOTSTRAP_RELAY_MULTIADDRS:
        '/dns4/relay-a.test/tcp/4011/p2p/12D3A',
    });
    const multiaddrs = configuration.getBootstrapRelayMultiaddrs();

    multiaddrs.push('/dns4/evil.test/tcp/4011/p2p/12D3Evil');

    expect(configuration.getBootstrapRelayMultiaddrs()).toEqual([
      '/dns4/relay-a.test/tcp/4011/p2p/12D3A',
    ]);
  });
});
