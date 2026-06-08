import NodeStartupSyncReadiness from '@app/apps/synchronizers/NodeStartupSyncReadiness';
import NodeHeartbeatSender from '@app/contexts/nodes/application/send-heartbeat/NodeHeartbeatSender';
import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';
import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import { PublicRelayRecordRegistry } from '@app/shared/infrastructure/network/relay/PublicRelayRecordRegistry';
import { mock, MockProxy } from 'jest-mock-extended';

describe('NodeStartupSyncReadiness', () => {
  let heartbeatSender: MockProxy<NodeHeartbeatSender>;
  let ipfs: MockProxy<IPFS>;
  let relayRecordRegistry: PublicRelayRecordRegistry;

  beforeEach(() => {
    process.env.STARTUP_SYNC_PEER_WAIT_MS = '0';
    heartbeatSender = mock<NodeHeartbeatSender>();
    ipfs = mock<IPFS>();
    relayRecordRegistry = new PublicRelayRecordRegistry();
    relayRecordRegistry.clear();
  });

  afterEach(() => {
    delete process.env.STARTUP_SYNC_PEER_WAIT_MS;
  });

  it('should report readiness independently for each network', async () => {
    ipfs.getNetworks.mockResolvedValue([
      network('ready-network', ['peer-a']),
      network('unready-network', []),
    ] as never);
    const readiness = new NodeStartupSyncReadiness(
      heartbeatSender,
      ipfs,
      relayRecordRegistry,
    );

    const result = await readiness.prepare([
      'ready-network',
      'unready-network',
    ]);

    expect(heartbeatSender.send).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      {
        networkId: 'ready-network',
        peerCount: 1,
        ready: true,
      },
      {
        networkId: 'unready-network',
        peerCount: 0,
        ready: false,
      },
    ]);
  });

  it('should report private networks ready when a stored relay fallback exists', async () => {
    relayRecordRegistry.save({
      expiresAt: Date.now() - 1000,
      issuedAt: Date.now() - 2000,
      multiaddrs: ['/dns4/relay.test/tcp/4011/p2p/12D3Relay'],
      peerId: '12D3Relay',
      publicKey: 'public-key',
      role: 'relay',
      signature: 'signature',
      version: 1,
    });
    ipfs.getNetworks.mockResolvedValue([
      network('private-network', [], true),
    ] as never);
    const readiness = new NodeStartupSyncReadiness(
      heartbeatSender,
      ipfs,
      relayRecordRegistry,
    );

    const result = await readiness.prepare(['private-network']);

    expect(result).toEqual([
      {
        networkId: 'private-network',
        peerCount: 0,
        ready: true,
      },
    ]);
  });

  function network(
    id: string,
    peers: string[],
    privateNetwork: boolean = false,
  ): Partial<IPFSNetwork> {
    return {
      getId: () => id,
      getPeers: () => peers,
      isPrivate: () => privateNetwork,
    };
  }
});
