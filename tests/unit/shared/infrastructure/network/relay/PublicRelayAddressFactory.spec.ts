import { PublicRelayAddressFactory } from '../../../../../../src/shared/infrastructure/network/relay/PublicRelayAddressFactory';
import { PublicRelayConfiguration } from '../../../../../../src/shared/infrastructure/network/relay/PublicRelayConfiguration';

describe('PublicRelayAddressFactory', () => {
  it('should build listen addresses from configured ports', () => {
    const factory = new PublicRelayAddressFactory(
      PublicRelayConfiguration.fromEnvironment({
        PIGEON_LIBP2P_PORT: '4101',
        PIGEON_RELAY_PORT: '4111',
      }),
    );

    expect(factory.libp2pListenAddress()).toBe('/ip4/0.0.0.0/tcp/4101');
    expect(factory.relayListenAddress()).toBe('/ip4/0.0.0.0/tcp/4111');
  });

  it('should build DNS advertised relay addresses', () => {
    const factory = new PublicRelayAddressFactory(
      PublicRelayConfiguration.fromEnvironment({
        PIGEON_PUBLIC_HOST: 'relay.example.com',
        PIGEON_RELAY_PORT: '4111',
      }),
    );

    expect(factory.relayAdvertiseAddress('12D3Relay')).toBe(
      '/dns4/relay.example.com/tcp/4111/p2p/12D3Relay',
    );
  });

  it('should build IP advertised relay addresses', () => {
    const factory = new PublicRelayAddressFactory(
      PublicRelayConfiguration.fromEnvironment({
        PIGEON_PUBLIC_HOST: '203.0.113.7',
        PIGEON_RELAY_PORT: '4111',
      }),
    );

    expect(factory.relayAdvertiseAddress('12D3Relay')).toBe(
      '/ip4/203.0.113.7/tcp/4111/p2p/12D3Relay',
    );
  });

  it('should not advertise when public host is missing', () => {
    const factory = new PublicRelayAddressFactory(
      PublicRelayConfiguration.fromEnvironment({}),
    );

    expect(factory.relayAdvertiseAddress('12D3Relay')).toBeUndefined();
    expect(factory.libp2pAdvertiseAddress('12D3Relay')).toBeUndefined();
  });
});
