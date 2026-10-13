import { NodeNetworkSynchronizationSource } from '@app/contexts/nodes/application/find-network-synchronization/NodeNetworkSynchronizationSource';
import { NodeCommunityStateDigest } from '@app/contexts/nodes/domain/value-objects/NodeCommunityStateDigest';
import InMemoryNodeNetworkSynchronizationMonitor from '@app/contexts/nodes/infrastructure/network-synchronization/InMemoryNodeNetworkSynchronizationMonitor';

type MutableStore = {
  join: () => void;
  leave: () => void;
  peerIds: Set<string>;
};

const DIGEST = new NodeCommunityStateDigest('A'.repeat(43));
const OTHER_DIGEST = new NodeCommunityStateDigest('B'.repeat(43));

function storeSource(name: string): {
  mutable: MutableStore;
  source: NodeNetworkSynchronizationSource['stores'][number];
} {
  const peerIds = new Set<string>();
  let join = (): void => undefined;
  let leave = (): void => undefined;

  return {
    mutable: {
      join: () => join(),
      leave: () => leave(),
      peerIds,
    },
    source: {
      getPeerIds: () => [...peerIds],
      name,
      onPeerJoined: (listener) => {
        join = listener;
      },
      onPeerLeft: (listener) => {
        leave = listener;
      },
    },
  };
}

function privateNetwork(
  stores: NodeNetworkSynchronizationSource['stores'],
  connectedPeerIds: string[],
): NodeNetworkSynchronizationSource {
  return {
    getConnectedPeerIds: () => connectedPeerIds,
    id: 'private-network',
    isPrivate: true,
    localPeerId: 'local-peer',
    name: 'Private network',
    onPeerConnected: jest.fn(),
    onPeerDisconnected: jest.fn(),
    stores,
    type: 'private',
  };
}

function replicatingPeer(
  monitor: InMemoryNodeNetworkSynchronizationMonitor,
  peerIds: string[],
): void {
  const store = storeSource('communityOperations');

  peerIds.forEach((peerId) => store.mutable.peerIds.add(peerId));
  monitor.observe(privateNetwork([store.source], peerIds));
}

describe('InMemoryNodeNetworkSynchronizationMonitor', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reports private network convergence once every peer replicates every store and holds the same community state', () => {
    const monitor = new InMemoryNodeNetworkSynchronizationMonitor();
    const identities = storeSource('identities');
    const messages = storeSource('messages');
    const listener = jest.fn();

    monitor.onChanged(listener);
    monitor.observe(
      privateNetwork([identities.source, messages.source], ['peer-1']),
    );

    expect(monitor.read().toPrimitives().networks[0]).toMatchObject({
      connectedPeerIds: ['peer-1'],
      convergedStoreCount: 0,
      replicationPeerIds: [],
      state: 'syncing',
      totalStoreCount: 2,
    });

    identities.mutable.peerIds.add('peer-1');
    identities.mutable.join();

    expect(monitor.read().toPrimitives().networks[0]).toMatchObject({
      convergedStoreCount: 1,
      replicationPeerIds: ['peer-1'],
      state: 'syncing',
    });

    messages.mutable.peerIds.add('peer-1');
    messages.mutable.join();
    monitor.recordLocalCommunityState('private-network', DIGEST);
    monitor.recordPeerCommunityState('private-network', 'peer-1', DIGEST);

    expect(monitor.read().toPrimitives().networks[0]).toMatchObject({
      communityState: {
        peers: [{ peerId: 'peer-1', state: 'converged' }],
        state: 'converged',
      },
      convergedStoreCount: 2,
      state: 'converged',
    });
    expect(listener).toHaveBeenCalledTimes(4);
  });

  it('does not report convergence while a replicating peer has not announced its community state', () => {
    const monitor = new InMemoryNodeNetworkSynchronizationMonitor();

    replicatingPeer(monitor, ['peer-1']);
    monitor.recordLocalCommunityState('private-network', DIGEST);

    expect(monitor.read().toPrimitives().networks[0]).toMatchObject({
      communityState: {
        peers: [{ peerId: 'peer-1', state: 'unknown' }],
        state: 'unknown',
      },
      convergedStoreCount: 1,
      state: 'syncing',
      totalStoreCount: 1,
    });
  });

  it('does not report convergence while a replicating peer holds a different community state', () => {
    const monitor = new InMemoryNodeNetworkSynchronizationMonitor();

    replicatingPeer(monitor, ['peer-1', 'peer-2']);
    monitor.recordLocalCommunityState('private-network', DIGEST);
    monitor.recordPeerCommunityState('private-network', 'peer-1', DIGEST);
    monitor.recordPeerCommunityState('private-network', 'peer-2', OTHER_DIGEST);

    expect(monitor.read().toPrimitives().networks[0]).toMatchObject({
      communityState: {
        peers: [
          { peerId: 'peer-1', state: 'converged' },
          { peerId: 'peer-2', state: 'diverged' },
        ],
        state: 'diverged',
      },
      state: 'syncing',
    });
  });

  it('cannot compare community state before the local state is known', () => {
    const monitor = new InMemoryNodeNetworkSynchronizationMonitor();

    replicatingPeer(monitor, ['peer-1']);
    monitor.recordPeerCommunityState('private-network', 'peer-1', DIGEST);

    expect(monitor.read().toPrimitives().networks[0]).toMatchObject({
      communityState: {
        peers: [{ peerId: 'peer-1', state: 'unknown' }],
        state: 'unknown',
      },
      state: 'syncing',
    });
  });

  it('forgets a community state announcement once it is stale', () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const monitor = new InMemoryNodeNetworkSynchronizationMonitor();

    replicatingPeer(monitor, ['peer-1']);
    monitor.recordLocalCommunityState('private-network', DIGEST);
    monitor.recordPeerCommunityState('private-network', 'peer-1', DIGEST);

    now.mockReturnValue(
      1_000_000 +
        InMemoryNodeNetworkSynchronizationMonitor.COMMUNITY_STATE_TTL_MS +
        1,
    );

    expect(monitor.read().toPrimitives().networks[0]).toMatchObject({
      communityState: {
        peers: [{ peerId: 'peer-1', state: 'unknown' }],
        state: 'unknown',
      },
      state: 'syncing',
    });
  });

  it('ignores community state announced under its own peer id or for unknown networks', () => {
    const monitor = new InMemoryNodeNetworkSynchronizationMonitor();
    const listener = jest.fn();

    replicatingPeer(monitor, ['local-peer']);
    monitor.onChanged(listener);
    monitor.recordLocalCommunityState('private-network', DIGEST);
    monitor.recordPeerCommunityState('private-network', 'local-peer', DIGEST);
    monitor.recordPeerCommunityState('other-network', 'peer-1', DIGEST);

    expect(
      monitor.read().toPrimitives().networks[0].communityState.peers,
    ).toEqual([{ peerId: 'local-peer', state: 'unknown' }]);
    expect(listener).not.toHaveBeenCalled();
  });

  it('notifies listeners only when a community state comparison changes', () => {
    const monitor = new InMemoryNodeNetworkSynchronizationMonitor();
    const listener = jest.fn();

    replicatingPeer(monitor, ['peer-1']);
    monitor.onChanged(listener);
    monitor.recordLocalCommunityState('private-network', DIGEST);
    monitor.recordPeerCommunityState('private-network', 'peer-1', DIGEST);
    monitor.recordPeerCommunityState('private-network', 'peer-1', DIGEST);
    monitor.recordLocalCommunityState('private-network', DIGEST);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(
      listener.mock.calls[0][0].toPrimitives().networks[0].communityState,
    ).toEqual({
      peers: [{ peerId: 'peer-1', state: 'converged' }],
      state: 'converged',
    });
  });

  it('lists every observed network with the peer id it announces under', () => {
    const monitor = new InMemoryNodeNetworkSynchronizationMonitor();

    replicatingPeer(monitor, []);

    expect(monitor.observedNetworks()).toEqual([
      { id: 'private-network', localPeerId: 'local-peer' },
    ]);
  });

  it('does not treat unrelated public transport peers as replication peers', () => {
    const monitor = new InMemoryNodeNetworkSynchronizationMonitor();
    const identities = storeSource('identities');

    monitor.observe({
      getConnectedPeerIds: () => ['public-dht-peer'],
      id: 'public-network',
      isPrivate: false,
      localPeerId: 'local-peer',
      name: 'Public network',
      onPeerConnected: jest.fn(),
      onPeerDisconnected: jest.fn(),
      stores: [identities.source],
      type: 'public',
    });

    expect(monitor.read().toPrimitives().networks[0]).toMatchObject({
      communityState: { peers: [], state: 'unknown' },
      connectedPeerIds: ['public-dht-peer'],
      convergedStoreCount: 0,
      replicationPeerIds: [],
      state: 'waiting_for_peers',
    });
  });
});
