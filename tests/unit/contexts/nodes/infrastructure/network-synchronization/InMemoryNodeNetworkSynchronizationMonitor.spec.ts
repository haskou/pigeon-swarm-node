import { NodeNetworkSynchronizationSource } from '@app/contexts/nodes/application/find-network-synchronization/NodeNetworkSynchronizationSource';
import InMemoryNodeNetworkSynchronizationMonitor from '@app/contexts/nodes/infrastructure/network-synchronization/InMemoryNodeNetworkSynchronizationMonitor';

type MutableStore = {
  join: () => void;
  leave: () => void;
  peerIds: Set<string>;
};

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

describe('InMemoryNodeNetworkSynchronizationMonitor', () => {
  it('reports private network convergence for every connected peer and store', () => {
    const monitor = new InMemoryNodeNetworkSynchronizationMonitor();
    const identities = storeSource('identities');
    const messages = storeSource('messages');
    const connectedPeerIds = ['peer-1'];
    const listener = jest.fn();

    monitor.onChanged(listener);
    monitor.observe({
      getConnectedPeerIds: () => connectedPeerIds,
      id: 'private-network',
      isPrivate: true,
      name: 'Private network',
      onPeerConnected: jest.fn(),
      onPeerDisconnected: jest.fn(),
      stores: [identities.source, messages.source],
      type: 'private',
    });

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

    expect(monitor.read().toPrimitives().networks[0]).toMatchObject({
      convergedStoreCount: 2,
      state: 'converged',
    });
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('does not treat unrelated public transport peers as replication peers', () => {
    const monitor = new InMemoryNodeNetworkSynchronizationMonitor();
    const identities = storeSource('identities');

    monitor.observe({
      getConnectedPeerIds: () => ['public-dht-peer'],
      id: 'public-network',
      isPrivate: false,
      name: 'Public network',
      onPeerConnected: jest.fn(),
      onPeerDisconnected: jest.fn(),
      stores: [identities.source],
      type: 'public',
    });

    expect(monitor.read().toPrimitives().networks[0]).toMatchObject({
      connectedPeerIds: ['public-dht-peer'],
      convergedStoreCount: 0,
      replicationPeerIds: [],
      state: 'waiting_for_peers',
    });
  });
});
