import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import Kernel from '@app/Kernel';
import WinstonLogger from '@app/shared/infrastructure/logs/WinstonLogger';
import { PublicRelayRecordDiscovery } from '@app/shared/infrastructure/network/relay/PublicRelayRecordDiscovery';
import { PublicRelayRecordPrimitives } from '@app/shared/infrastructure/network/relay/PublicRelayRecordPrimitives';
import PublicRelayRuntime from '@app/shared/infrastructure/network/relay/PublicRelayRuntime';
import { PublicRelayRuntimeNode } from '@app/shared/infrastructure/network/relay/PublicRelayRuntimeNode';
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
    const runtime = new PublicRelayRuntime(mock<IPFSNetworkRegistry>());
    const record = publicRelayRecord();
    const node = {
      peerId: {
        toString: () => 'peer-local',
      },
      services: {
        pubsub: mock(),
      },
    } as PublicRelayRuntimeNode;
    const discovery = mock<PublicRelayRecordDiscovery>();

    discovery.publish.mockRejectedValue(new Error('pubsub stopped'));
    (
      runtime as unknown as {
        discovery: PublicRelayRecordDiscovery;
        state: { node?: PublicRelayRuntimeNode };
        buildRelayRecord(peerId: string): Promise<PublicRelayRecordPrimitives>;
        publishCurrentRelayRecord(): Promise<void>;
      }
    ).discovery = discovery;
    (
      runtime as unknown as {
        state: { node?: PublicRelayRuntimeNode };
      }
    ).state.node = node;
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

    expect(discovery.publish).toHaveBeenCalledWith(node, record);
    expect(logger.warn).toHaveBeenCalledWith(
      'Public relay record publication failed: Error: pubsub stopped',
    );
  });
});
