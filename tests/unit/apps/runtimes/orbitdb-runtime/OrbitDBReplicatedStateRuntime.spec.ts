import OrbitDBReplicatedStateRuntime from '@app/apps/runtimes/orbitdb-runtime/OrbitDBReplicatedStateRuntime';
import NodeNetworkSynchronizationMonitor from '@app/contexts/nodes/application/find-network-synchronization/NodeNetworkSynchronizationMonitor';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import OrbitDBMetadataHeadRepairer from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBMetadataHeadRepairer';
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
      {
        repairCritical: jest.fn().mockResolvedValue({}),
        repairSecondary: jest.fn().mockResolvedValue({}),
      } as unknown as OrbitDBMetadataHeadRepairer,
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
      {
        repairCritical: jest.fn().mockResolvedValue({}),
        repairSecondary: jest.fn().mockResolvedValue({}),
      } as unknown as OrbitDBMetadataHeadRepairer,
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

  it('debounces targeted read-index repair for replicated document updates', async () => {
    jest.useFakeTimers();

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
    const repairCritical = jest.fn().mockResolvedValue({});
    const repairStore = jest.fn().mockResolvedValue({ identities: 1 });
    const runtime = new OrbitDBReplicatedStateRuntime(
      networkRegistry,
      replicatedStateRegistry,
      {
        repairCritical,
        repairStore,
        repairSecondary: jest.fn().mockResolvedValue({}),
      } as unknown as OrbitDBMetadataHeadRepairer,
      fakeSynchronizationMonitor(),
    );

    jest.spyOn(OrbitDBPrivateNetworkStores, 'open').mockResolvedValue(stores);

    await runtime.run();
    await jest.advanceTimersByTimeAsync(1_000);

    const updateHandler = (
      stores.identities as unknown as FakeStore
    ).events.on.mock.calls.find(([event]) => event === 'update')?.[1] as
      | (() => void)
      | undefined;

    expect(updateHandler).toBeDefined();
    expect(repairCritical).toHaveBeenCalledTimes(1);

    updateHandler?.();
    updateHandler?.();
    await jest.advanceTimersByTimeAsync(29_999);

    expect(repairStore).not.toHaveBeenCalled();
    expect(repairCritical).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(1);

    expect(repairStore).toHaveBeenCalledTimes(1);
    expect(repairStore).toHaveBeenCalledWith('identities');
    expect(repairCritical).toHaveBeenCalledTimes(1);

    updateHandler?.();
    await jest.advanceTimersByTimeAsync(30_000);

    expect(repairStore).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(15 * 60_000);

    expect(repairStore).toHaveBeenCalledTimes(2);
  });
});
