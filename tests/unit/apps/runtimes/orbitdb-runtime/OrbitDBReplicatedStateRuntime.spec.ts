import OrbitDBReplicatedStateRuntime from '@app/apps/runtimes/orbitdb-runtime/OrbitDBReplicatedStateRuntime';
import NodeNetworkSynchronizationMonitor from '@app/contexts/nodes/application/find-network-synchronization/NodeNetworkSynchronizationMonitor';
import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import { OrbitDBPrivateNetworkStores } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBPrivateNetworkStores';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import Kernel from '@haskou/ddd-kernel';
import { mock } from 'jest-mock-extended';

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
    communityOperations: fakeStore(),
    contentReplication: fakeStore(),
    conversationOperations: fakeStore(),
    getSynchronizationStores: jest.fn().mockReturnValue([]),
    heads: fakeStore(),
    identities: fakeStore(),
    keychains: fakeStore(),
    messages: fakeStore(),
    notifications: fakeStore(),
    reactions: fakeStore(),
    requests: fakeStore(),
    startSynchronization: jest.fn().mockResolvedValue(undefined),
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

function restartedPrivateNetwork(): IPFSNetwork {
  const network = mock<IPFSNetwork>();

  network.getId.mockReturnValue('network-1');
  network.getName.mockReturnValue('Private network');
  network.getPeerId.mockReturnValue('peer-1');
  network.getPeers.mockReturnValue([]);
  network.isPrivate.mockReturnValue(true);

  return network;
}

function networkRegistryWith(network: IPFSNetwork): IPFSNetworkRegistry {
  const networkRegistry = mock<IPFSNetworkRegistry>();

  networkRegistry.getAll.mockReturnValue([network]);

  return networkRegistry;
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
    const synchronizationMonitor = fakeSynchronizationMonitor();
    const runtime = new OrbitDBReplicatedStateRuntime(
      networkRegistry,
      replicatedStateRegistry,
      synchronizationMonitor,
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
    expect(synchronizationMonitor.observe).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'network-1', localPeerId: 'peer-1' }),
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
      stores.communityOperations,
      stores.conversationOperations,
      stores.identities,
      stores.keychains,
      stores.messages,
    ]) {
      expect((store as unknown as FakeStore).events.on).not.toHaveBeenCalled();
      expect((store as unknown as FakeStore).all).not.toHaveBeenCalled();
    }
  });

  it('keeps starting a restarted network when its replicated state cannot load a block in time', async () => {
    const stores = fakeStores();
    const replicatedStateRegistry = mock<OrbitDBReplicatedStateRegistry>();
    const synchronizationMonitor = mock<NodeNetworkSynchronizationMonitor>();
    const runtime = new OrbitDBReplicatedStateRuntime(
      networkRegistryWith(restartedPrivateNetwork()),
      replicatedStateRegistry,
      synchronizationMonitor,
    );

    jest.spyOn(OrbitDBPrivateNetworkStores, 'open').mockResolvedValue(stores);
    replicatedStateRegistry.register.mockRejectedValue(
      new DOMException(
        'The operation was aborted due to timeout',
        'TimeoutError',
      ),
    );

    await expect(runtime.run()).resolves.toBeUndefined();

    expect(synchronizationMonitor.observe).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'network-1', localPeerId: 'peer-1' }),
    );
    expect(stores.startSynchronization).toHaveBeenCalledTimes(1);
    expect(replicatedStateRegistry.unregister).not.toHaveBeenCalled();
    expect(Kernel.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'OrbitDB replicated state registration degraded: networkId=network-1',
      ),
    );
  });

  it('fails startup and releases the stores when registration fails for a non-transient reason', async () => {
    const stores = fakeStores();
    const replicatedStateRegistry = mock<OrbitDBReplicatedStateRegistry>();
    const synchronizationMonitor = mock<NodeNetworkSynchronizationMonitor>();
    const runtime = new OrbitDBReplicatedStateRuntime(
      networkRegistryWith(restartedPrivateNetwork()),
      replicatedStateRegistry,
      synchronizationMonitor,
    );
    const failure = new Error('OrbitDB document history is incomplete');

    jest.spyOn(OrbitDBPrivateNetworkStores, 'open').mockResolvedValue(stores);
    replicatedStateRegistry.register.mockRejectedValue(failure);

    await expect(runtime.run()).rejects.toBe(failure);

    expect(replicatedStateRegistry.unregister).toHaveBeenCalledWith(
      'network-1',
    );
    expect(synchronizationMonitor.observe).not.toHaveBeenCalled();
    expect(stores.startSynchronization).not.toHaveBeenCalled();
  });
});
