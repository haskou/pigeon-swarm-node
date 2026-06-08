import NodeStartupSyncReadiness from '@app/apps/synchronizers/NodeStartupSyncReadiness';
import NodeHeartbeatSender from '@app/contexts/nodes/application/send-heartbeat/NodeHeartbeatSender';
import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';
import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import { mock, MockProxy } from 'jest-mock-extended';

describe('NodeStartupSyncReadiness', () => {
  let heartbeatSender: MockProxy<NodeHeartbeatSender>;
  let ipfs: MockProxy<IPFS>;

  beforeEach(() => {
    process.env.STARTUP_SYNC_PEER_WAIT_MS = '0';
    heartbeatSender = mock<NodeHeartbeatSender>();
    ipfs = mock<IPFS>();
  });

  afterEach(() => {
    delete process.env.STARTUP_SYNC_PEER_WAIT_MS;
  });

  it('should report readiness independently for each network', async () => {
    ipfs.getNetworks.mockResolvedValue([
      network('ready-network', ['peer-a']),
      network('unready-network', []),
    ] as never);
    const readiness = new NodeStartupSyncReadiness(heartbeatSender, ipfs);

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

  function network(id: string, peers: string[]): Partial<IPFSNetwork> {
    return {
      getId: () => id,
      getPeers: () => peers,
    };
  }
});
