import { CallRelayRecord } from '@app/apps/apis/calls-api/CallRelayRecord';
import CallRelayRecordDiscovery from '@app/apps/apis/calls-api/CallRelayRecordDiscovery';
import CallRelayRecordSigner from '@app/apps/apis/calls-api/CallRelayRecordSigner';
import CallRelayRuntime from '@app/apps/apis/calls-api/CallRelayRuntime';
import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import { Libp2pPrivateKeyLike } from '@app/contexts/shared/infrastructure/ipfs/networks/adapters/Libp2pKeyAdapter';
import WinstonLogger from '@app/shared/infrastructure/logs/WinstonLogger';
import { normalizeRelayRuntimeSettings } from '@app/shared/infrastructure/network/relay/RelayRuntimeSettings';
import Kernel from '@haskou/ddd-kernel';
import { mock, MockProxy } from 'jest-mock-extended';

function clearCallRelayRuntimeState(): void {
  const state = (
    globalThis as typeof globalThis & {
      __pigeonSwarmCallRelayRuntime?: {
        publicationIntervals?: Record<string, NodeJS.Timeout>;
      };
    }
  ).__pigeonSwarmCallRelayRuntime;

  Object.values(state?.publicationIntervals || {}).forEach((interval) => {
    clearInterval(interval);
  });

  delete (
    globalThis as typeof globalThis & {
      __pigeonSwarmCallRelayRuntime?: unknown;
    }
  ).__pigeonSwarmCallRelayRuntime;
}

describe('CallRelayRuntime', () => {
  let previousEnvironment: NodeJS.ProcessEnv;
  let networkRegistry: MockProxy<IPFSNetworkRegistry>;
  let discovery: MockProxy<CallRelayRecordDiscovery>;
  let logger: MockProxy<WinstonLogger>;
  let signer: MockProxy<CallRelayRecordSigner>;
  let publicNetwork: MockProxy<IPFSNetwork>;

  beforeEach(() => {
    previousEnvironment = { ...process.env };
    process.env.CALLS_TURN_SHARED_SECRET = 'turn-shared-secret';
    clearCallRelayRuntimeState();

    networkRegistry = mock<IPFSNetworkRegistry>();
    discovery = mock<CallRelayRecordDiscovery>();
    logger = mock<WinstonLogger>();
    signer = mock<CallRelayRecordSigner>();
    publicNetwork = mock<IPFSNetwork>();

    publicNetwork.getId.mockReturnValue('public-network');
    publicNetwork.isPrivate.mockReturnValue(false);
    networkRegistry.getAll.mockReturnValue([]);
    networkRegistry.getRelaySettings.mockReturnValue(
      normalizeRelayRuntimeSettings({
        callsRelay: {
          port: 4199,
        },
        publicHost: 'relay.example.test',
      }),
    );
    networkRegistry.getSharedPeerPrivateKey.mockResolvedValue(
      {} as Libp2pPrivateKeyLike,
    );
    jest.spyOn(Kernel, 'logger', 'get').mockReturnValue(logger);
    signer.sign.mockImplementation(async (payload) => {
      return new CallRelayRecord(
        {
          ...payload,
          peerId: '12D3KooWCallRelay',
          poolSignature: 'pool-signature',
          publicKey: 'public-key',
        },
        'signature',
      );
    });
  });

  afterEach(() => {
    process.env = previousEnvironment;
    clearCallRelayRuntimeState();
    jest.restoreAllMocks();
  });

  it('should publish a signed call relay record when a public network is registered', async () => {
    let registeredListener:
      | ((network: IPFSNetwork) => Promise<void> | void)
      | undefined;
    const runtime = new CallRelayRuntime(networkRegistry, discovery, signer);

    networkRegistry.onNetworkRegistered.mockImplementation((listener) => {
      registeredListener = listener;
    });

    await runtime.run();
    await registeredListener?.(publicNetwork);

    expect(discovery.startConnection).toHaveBeenCalledWith(publicNetwork);
    expect(signer.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'call-relay',
        urls: [
          'turn:relay.example.test:4199?transport=udp',
          'turn:relay.example.test:4199?transport=tcp',
        ],
        version: 1,
      }),
      expect.anything(),
      'turn-shared-secret',
    );
    expect(discovery.publishConnection).toHaveBeenCalledWith(
      publicNetwork,
      expect.objectContaining({
        poolSignature: 'pool-signature',
        role: 'call-relay',
        signature: 'signature',
        urls: [
          'turn:relay.example.test:4199?transport=udp',
          'turn:relay.example.test:4199?transport=tcp',
        ],
        version: 1,
      }),
    );
  });
});
