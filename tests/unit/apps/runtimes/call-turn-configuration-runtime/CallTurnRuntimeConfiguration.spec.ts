import { CallTurnRuntimeConfiguration } from '@app/shared/infrastructure/network/relay/CallTurnRuntimeConfiguration';
import { normalizeRelayRuntimeSettings } from '@app/shared/infrastructure/network/relay/RelayRuntimeSettings';

describe('CallTurnRuntimeConfiguration', () => {
  it('should serialize the persisted call relay and private relay ports', () => {
    const configuration = CallTurnRuntimeConfiguration.fromRelaySettings(
      normalizeRelayRuntimeSettings({
        callsRelay: {
          port: 4101,
        },
        privateRelay: {
          enabled: true,
          portEnd: 4105,
          portStart: 4102,
        },
        publicHost: 'relay.example.test',
      }),
    );

    expect(configuration.isEnabled()).toBe(true);
    expect(configuration.serialize()).toBe(
      [
        'version=1',
        'enabled=true',
        'listening_port=4101',
        'relay_port_start=4102',
        'relay_port_end=4105',
        '',
      ].join('\n'),
    );
    expect(configuration.getTurnUrls(['udp', 'tcp'])).toEqual([
      'turn:relay.example.test:4101?transport=udp',
      'turn:relay.example.test:4101?transport=tcp',
    ]);
  });

  it.each([
    {
      callsRelay: { port: 4101 },
      privateRelay: {
        enabled: true,
        portEnd: 4105,
        portStart: 4102,
      },
    },
    {
      callsRelay: {},
      privateRelay: {
        enabled: true,
        portEnd: 4105,
        portStart: 4102,
      },
      publicHost: 'relay.example.test',
    },
    {
      callsRelay: { port: 4101 },
      privateRelay: {
        enabled: false,
        portEnd: 4105,
        portStart: 4102,
      },
      publicHost: 'relay.example.test',
    },
    {
      callsRelay: { port: 4103 },
      privateRelay: {
        enabled: true,
        portEnd: 4105,
        portStart: 4102,
      },
      publicHost: 'relay.example.test',
    },
  ])(
    'should disable incomplete or conflicting runtime configuration',
    (settings) => {
      const configuration = CallTurnRuntimeConfiguration.fromRelaySettings(
        normalizeRelayRuntimeSettings(settings),
      );

      expect(configuration.isEnabled()).toBe(false);
      expect(configuration.serialize()).toBe(
        ['version=1', 'enabled=false', ''].join('\n'),
      );
      expect(configuration.getTurnUrls(['udp', 'tcp'])).toEqual([]);
    },
  );
});
