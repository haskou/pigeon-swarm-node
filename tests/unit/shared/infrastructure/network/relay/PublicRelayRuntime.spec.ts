import { IPFSConnection } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSConnection';
import {
  libp2pKeyAdapter,
  Libp2pPrivateKeyLike,
} from '@app/contexts/shared/infrastructure/ipfs/networks/adapters/Libp2pKeyAdapter';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import Kernel from '@haskou/ddd-kernel';
import WinstonLogger from '@app/shared/infrastructure/logs/WinstonLogger';
import PrivateNetworkRelayRecordDirectory from '@app/shared/infrastructure/network/relay/PrivateNetworkRelayRecordDirectory';
import { PublicRelayRecordDiscovery } from '@app/shared/infrastructure/network/relay/PublicRelayRecordDiscovery';
import { PublicRelayRecordPrimitives } from '@app/shared/infrastructure/network/relay/PublicRelayRecordPrimitives';
import PublicRelayRuntime from '@app/shared/infrastructure/network/relay/PublicRelayRuntime';
import { PublicRelayRuntimeNode } from '@app/shared/infrastructure/network/relay/PublicRelayRuntimeNode';
import { defaultRelayRuntimeSettings } from '@app/shared/infrastructure/network/relay/RelayRuntimeSettings';
import { mock, MockProxy } from 'jest-mock-extended';

function clearPublicRelayRuntimeState(): void {
  delete (
    globalThis as typeof globalThis & {
      __pigeonSwarmPublicRelayRuntime?: unknown;
    }
  ).__pigeonSwarmPublicRelayRuntime;
}

function publicRelayRecord(): PublicRelayRecordPrimitives {
  return {
    expiresAt: Date.now() + 60_000,
    issuedAt: Date.now(),
    multiaddrs: ['/dns4/relay.example.com/tcp/4011/p2p/peer-local'],
    peerId: 'peer-local',
    publicKey: 'public-key',
    role: 'relay',
    signature: 'signature',
    version: 1,
  };
}

describe('PublicRelayRuntime', () => {
  let logger: MockProxy<WinstonLogger>;

  beforeEach(() => {
    clearPublicRelayRuntimeState();
    logger = mock<WinstonLogger>();
    jest.spyOn(Kernel, 'logger', 'get').mockReturnValue(logger);
  });

  afterEach(() => {
    clearPublicRelayRuntimeState();
    jest.restoreAllMocks();
  });

  it('should log public relay record publish failures', async () => {
    const networkRegistry = mock<IPFSNetworkRegistry>();
    const relayRecordDirectory = mock<PrivateNetworkRelayRecordDirectory>();
    const runtime = new PublicRelayRuntime(
      networkRegistry,
      relayRecordDirectory,
    );
    const record = publicRelayRecord();
    const connection = mock<IPFSConnection>();
    const discovery = mock<PublicRelayRecordDiscovery>();

    networkRegistry.getRelaySettings.mockReturnValue(
      defaultRelayRuntimeSettings(),
    );
    connection.getPeerId.mockReturnValue('peer-local');
    discovery.publishConnection.mockRejectedValue(new Error('pubsub stopped'));
    (
      runtime as unknown as {
        discovery: PublicRelayRecordDiscovery;
        state: { connection?: IPFSConnection };
        buildRelayRecord(peerId: string): Promise<PublicRelayRecordPrimitives>;
        publishCurrentRelayRecord(): Promise<void>;
      }
    ).discovery = discovery;
    (
      runtime as unknown as {
        state: { connection?: IPFSConnection };
      }
    ).state.connection = connection;
    (
      runtime as unknown as {
        buildRelayRecord(peerId: string): Promise<PublicRelayRecordPrimitives>;
      }
    ).buildRelayRecord = jest.fn().mockResolvedValue(record);

    await (
      runtime as unknown as {
        publishCurrentRelayRecord(): Promise<void>;
      }
    ).publishCurrentRelayRecord();

    expect(discovery.publishConnection).toHaveBeenCalledWith(
      connection,
      record,
    );
    expect(logger.warn).toHaveBeenCalledWith(
      'Public relay record publication failed: Error: pubsub stopped',
    );
  });

  it('should configure the relay on the shared public IPFS connection', async () => {
    jest.useFakeTimers();
    const networkRegistry = mock<IPFSNetworkRegistry>();
    const relayRecordDirectory = mock<PrivateNetworkRelayRecordDirectory>();
    const connection = mock<IPFSConnection>();
    const sharedPrivateKey = {} as Libp2pPrivateKeyLike;
    const node = {
      peerId: { toString: () => 'peer-local' },
      services: { pubsub: mock() },
    } as PublicRelayRuntimeNode;
    const runtime = new PublicRelayRuntime(
      networkRegistry,
      relayRecordDirectory,
    );

    networkRegistry.getRelaySettings.mockReturnValue({
      ...defaultRelayRuntimeSettings(),
      publicHost: 'relay.example.com',
      publicRelay: {
        autoEnabled: false,
        discoveryEnabled: false,
        enabled: true,
        libp2pPort: 4001,
        port: 4011,
      },
    });
    networkRegistry.getSharedPeerPrivateKey.mockResolvedValue(sharedPrivateKey);
    jest
      .spyOn(libp2pKeyAdapter, 'peerIdFromPrivateKey')
      .mockReturnValue('peer-local');
    connection.getPeerId.mockReturnValue('peer-local');
    connection.getHeliaCore.mockReturnValue({
      libp2p: node,
    } as unknown as ReturnType<IPFSConnection['getHeliaCore']>);
    relayRecordDirectory.configurePublicConnection.mockResolvedValue(
      connection,
    );
    (
      runtime as unknown as {
        buildRelayRecord(): Promise<PublicRelayRecordPrimitives>;
      }
    ).buildRelayRecord = jest.fn().mockResolvedValue(publicRelayRecord());

    await runtime.start();

    expect(
      relayRecordDirectory.configurePublicConnection,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        enableRelayServer: true,
        sharedPrivateKey,
      }),
    );
    expect(runtime.debugState().peerId).toBe('peer-local');
    jest.useRealTimers();
  });
});
