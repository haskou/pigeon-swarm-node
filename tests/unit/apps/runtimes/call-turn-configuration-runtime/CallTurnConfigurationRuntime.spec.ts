import CallTurnConfigurationRuntime from '@app/apps/runtimes/call-turn-configuration-runtime/CallTurnConfigurationRuntime';
import CallTurnRuntimeConfigurationPublisher from '@app/apps/runtimes/call-turn-configuration-runtime/CallTurnRuntimeConfigurationPublisher';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import WinstonLogger from '@app/shared/infrastructure/logs/WinstonLogger';
import {
  normalizeRelayRuntimeSettings,
  RelayRuntimeSettings,
} from '@app/shared/infrastructure/network/relay/RelayRuntimeSettings';
import Kernel from '@haskou/ddd-kernel';
import { mock, MockProxy } from 'jest-mock-extended';

describe('CallTurnConfigurationRuntime', () => {
  let listener:
    | ((settings: RelayRuntimeSettings) => Promise<void> | void)
    | undefined;
  let logger: MockProxy<WinstonLogger>;
  let networkRegistry: MockProxy<IPFSNetworkRegistry>;
  let publisher: MockProxy<CallTurnRuntimeConfigurationPublisher>;

  beforeEach(() => {
    listener = undefined;
    logger = mock<WinstonLogger>();
    networkRegistry = mock<IPFSNetworkRegistry>();
    publisher = mock<CallTurnRuntimeConfigurationPublisher>();

    networkRegistry.getRelaySettings.mockReturnValue(
      normalizeRelayRuntimeSettings({
        callsRelay: { port: 4101 },
        privateRelay: {
          enabled: true,
          portEnd: 4105,
          portStart: 4102,
        },
        publicHost: 'relay.example.test',
      }),
    );
    networkRegistry.onRelaySettingsChanged.mockImplementation(
      (settingsListener) => {
        listener = settingsListener;
      },
    );
    publisher.publish.mockResolvedValue();
    jest.spyOn(Kernel, 'logger', 'get').mockReturnValue(logger);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should publish current and updated persisted relay settings', async () => {
    const runtime = new CallTurnConfigurationRuntime(
      networkRegistry,
      publisher,
    );

    await runtime.run();
    await listener?.(
      normalizeRelayRuntimeSettings({
        callsRelay: { port: 4201 },
        privateRelay: {
          enabled: true,
          portEnd: 4205,
          portStart: 4202,
        },
        publicHost: 'updated-relay.example.test',
      }),
    );

    expect(publisher.publish).toHaveBeenCalledTimes(2);
    expect(publisher.publish.mock.calls[0][0].serialize()).toContain(
      'listening_port=4101',
    );
    expect(publisher.publish.mock.calls[1][0].serialize()).toContain(
      'listening_port=4201',
    );
  });
});
