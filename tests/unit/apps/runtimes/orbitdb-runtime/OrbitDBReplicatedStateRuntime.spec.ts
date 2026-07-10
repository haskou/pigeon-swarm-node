import OrbitDBReplicatedStateRuntime from '@app/apps/runtimes/orbitdb-runtime/OrbitDBReplicatedStateRuntime';
import NodeNetworkSynchronizationMonitor from '@app/contexts/nodes/application/find-network-synchronization/NodeNetworkSynchronizationMonitor';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { OrbitDBPrivateNetworkStores } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBPrivateNetworkStores';
import Kernel from '@haskou/ddd-kernel';

type FakeStore = {
  all: jest.Mock;
  events: {
    on: jest.Mock;
  };
};

function fakeStore(): FakeStore {
  return {
    all: jest.fn().mockResolvedValue([]),
    events: {
      on: jest.fn(),
    },
  };
}

function fakeStores(): OrbitDBPrivateNetworkStores {
  const stores = {
    calls: fakeStore(),
    communities: fakeStore(),
    contentReplication: fakeStore(),
    conversations: fakeStore(),
    getSynchronizationStores: jest.fn().mockReturnValue([]),
    heads: fakeStore(),
    identities: fakeStore(),
    keychains: fakeStore(),
    messages: fakeStore(),
    notifications: fakeStore(),
    reactions: fakeStore(),
    requests: fakeStore(),
  };

  return stores as unknown as OrbitDBPrivateNetworkStores;
}

function fakeSynchronizationMonitor(): NodeNetworkSynchronizationMonitor {
  return {
    observe: jest.fn(),
    onChanged: jest.fn(),
    read: jest.fn(),
    remove: jest.fn(),
  } as unknown as NodeNetworkSynchronizationMonitor;
}

describe('OrbitDBReplicatedStateRuntime', () => {
  beforeEach(() => {
    new Kernel({
      logger: {
        debug: jest.fn(),
        error: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
      },
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('waits for IPFS networks without registering stores', async () => {
    const networkRegistry = {
      getAll: jest.fn().mockReturnValue([]),
      onNetworkRegistered: jest.fn(),
      onNetworkRemoved: jest.fn(),
    } as unknown as IPFSNetworkRegistry;
    const replicatedStateRegistry = {
      register: jest.fn(),
      unregister: jest.fn(),
    } as unknown as OrbitDBReplicatedStateRegistry;
    const runtime = new OrbitDBReplicatedStateRuntime(
      networkRegistry,
      replicatedStateRegistry,
      fakeSynchronizationMonitor(),
    );
    await runtime.run();

    expect(replicatedStateRegistry.register).not.toHaveBeenCalled();
    expect(networkRegistry.getAll).toHaveBeenCalled();
    expect(networkRegistry.onNetworkRegistered).toHaveBeenCalled();
    expect(networkRegistry.onNetworkRemoved).toHaveBeenCalled();
  });

  it('registers network document stores', async () => {
    const stores = fakeStores();
    const network = {
      getId: jest.fn().mockReturnValue('network-1'),
      getName: jest.fn().mockReturnValue('Private network'),
      getPeerId: jest.fn().mockReturnValue('peer-1'),
      getPeers: jest.fn().mockReturnValue([]),
      getType: jest.fn().mockReturnValue('private'),
      isPrivate: jest.fn().mockReturnValue(true),
      onPeerConnected: jest.fn(),
      onPeerDisconnected: jest.fn(),
    };
    const networkRegistry = {
      getAll: jest.fn().mockReturnValue([network]),
      onNetworkRegistered: jest.fn(),
      onNetworkRemoved: jest.fn(),
    } as unknown as IPFSNetworkRegistry;
    const replicatedStateRegistry = {
      register: jest.fn(),
      unregister: jest.fn(),
    } as unknown as OrbitDBReplicatedStateRegistry;
    const runtime = new OrbitDBReplicatedStateRuntime(
      networkRegistry,
      replicatedStateRegistry,
      fakeSynchronizationMonitor(),
    );
    const open = jest
      .spyOn(OrbitDBPrivateNetworkStores, 'open')
      .mockResolvedValue(stores);
    const result = await Promise.race([
      runtime.run().then(() => 'resolved'),
      new Promise<string>((resolve) =>
        setTimeout(() => resolve('timeout'), 50),
      ),
    ]);

    expect(result).toBe('resolved');
    expect(open).toHaveBeenCalledWith(network);
    expect(replicatedStateRegistry.register).toHaveBeenCalledWith(
      'network-1',
      stores,
    );
  });

  it('does not scan document stores after replicated updates', async () => {
    const stores = fakeStores();
    const network = {
      getId: jest.fn().mockReturnValue('network-1'),
      getName: jest.fn().mockReturnValue('Private network'),
      getPeerId: jest.fn().mockReturnValue('peer-1'),
      getPeers: jest.fn().mockReturnValue([]),
      getType: jest.fn().mockReturnValue('private'),
      isPrivate: jest.fn().mockReturnValue(true),
      onPeerConnected: jest.fn(),
      onPeerDisconnected: jest.fn(),
    };
    const networkRegistry = {
      getAll: jest.fn().mockReturnValue([network]),
      onNetworkRegistered: jest.fn(),
      onNetworkRemoved: jest.fn(),
    } as unknown as IPFSNetworkRegistry;
    const replicatedStateRegistry = {
      register: jest.fn(),
      unregister: jest.fn(),
    } as unknown as OrbitDBReplicatedStateRegistry;
    const runtime = new OrbitDBReplicatedStateRuntime(
      networkRegistry,
      replicatedStateRegistry,
      fakeSynchronizationMonitor(),
    );

    jest.spyOn(OrbitDBPrivateNetworkStores, 'open').mockResolvedValue(stores);

    await runtime.run();

    for (const store of [
      stores.calls,
      stores.communities,
      stores.conversations,
      stores.identities,
      stores.keychains,
      stores.messages,
    ]) {
      expect((store as unknown as FakeStore).events.on).not.toHaveBeenCalled();
      expect((store as unknown as FakeStore).all).not.toHaveBeenCalled();
    }
  });
});
