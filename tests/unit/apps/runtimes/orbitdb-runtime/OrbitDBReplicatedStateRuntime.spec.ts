import OrbitDBReplicatedStateRuntime from '@app/apps/runtimes/orbitdb-runtime/OrbitDBReplicatedStateRuntime';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import OrbitDBDomainEventProjector from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBDomainEventProjector';
import OrbitDBMetadataHeadRepairer from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBMetadataHeadRepairer';
import OrbitDBReplicatedDomainEventPublisher from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedDomainEventPublisher';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { OrbitDBReplicatedStateStores } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateStores';
import Kernel from '@haskou/ddd-kernel';
import MessageBus from '@app/shared/infrastructure/messageBus/MessageBus';

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

function fakeStores(): OrbitDBReplicatedStateStores {
  const stores = {
    communities: fakeStore(),
    contentReplication: fakeStore(),
    conversations: fakeStore(),
    events: fakeStore(),
    heads: fakeStore(),
    identities: fakeStore(),
    keychains: fakeStore(),
    messages: fakeStore(),
    notifications: fakeStore(),
    reactions: fakeStore(),
    requests: fakeStore(),
  };

  return stores as unknown as OrbitDBReplicatedStateStores;
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

  it('waits for IPFS networks without registering a local OrbitDB state store', async () => {
    const networkRegistry = {
      getAll: jest.fn().mockReturnValue([]),
      onNetworkRegistered: jest.fn(),
      onNetworkRemoved: jest.fn(),
    } as unknown as IPFSNetworkRegistry;
    const replicatedStateRegistry = {
      register: jest.fn(),
      unregister: jest.fn(),
    } as unknown as OrbitDBReplicatedStateRegistry;
    const publisher = {
      registerNetworkStores: jest.fn(),
      unregisterNetworkStores: jest.fn(),
    } as unknown as OrbitDBReplicatedDomainEventPublisher;
    const runtime = new OrbitDBReplicatedStateRuntime(
      networkRegistry,
      {} as MessageBus,
      publisher,
      replicatedStateRegistry,
      { project: jest.fn() } as unknown as OrbitDBDomainEventProjector,
      {
        repairCritical: jest.fn().mockResolvedValue({}),
        repairSecondary: jest.fn().mockResolvedValue({}),
      } as unknown as OrbitDBMetadataHeadRepairer,
    );
    const openLocal = jest
      .spyOn(OrbitDBReplicatedStateStores, 'openLocal')
      .mockResolvedValue(fakeStores());

    await runtime.run();

    expect(openLocal).not.toHaveBeenCalled();
    expect(replicatedStateRegistry.register).not.toHaveBeenCalled();
    expect(publisher.registerNetworkStores).not.toHaveBeenCalled();
    expect(networkRegistry.getAll).toHaveBeenCalled();
    expect(networkRegistry.onNetworkRegistered).toHaveBeenCalled();
    expect(networkRegistry.onNetworkRemoved).toHaveBeenCalled();
  });

  it('registers network stores without replaying historical events', async () => {
    const stores = fakeStores();
    const network = {
      getId: jest.fn().mockReturnValue('network-1'),
      getPeerId: jest.fn().mockReturnValue('peer-1'),
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
    const publisher = {
      registerNetworkStores: jest.fn(),
      unregisterNetworkStores: jest.fn(),
    } as unknown as OrbitDBReplicatedDomainEventPublisher;
    const runtime = new OrbitDBReplicatedStateRuntime(
      networkRegistry,
      {} as MessageBus,
      publisher,
      replicatedStateRegistry,
      { project: jest.fn() } as unknown as OrbitDBDomainEventProjector,
      {
        repairCritical: jest.fn().mockResolvedValue({}),
        repairSecondary: jest.fn().mockResolvedValue({}),
      } as unknown as OrbitDBMetadataHeadRepairer,
    );
    const open = jest
      .spyOn(OrbitDBReplicatedStateStores, 'open')
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
    expect(publisher.registerNetworkStores).toHaveBeenCalledWith(
      'network-1',
      'peer-1',
      stores,
    );
    expect((stores.events as unknown as FakeStore).all).not.toHaveBeenCalled();
  });

  it('debounces targeted read-index repair for replicated document updates', async () => {
    jest.useFakeTimers();

    const stores = fakeStores();
    const network = {
      getId: jest.fn().mockReturnValue('network-1'),
      getPeerId: jest.fn().mockReturnValue('peer-1'),
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
    const publisher = {
      registerNetworkStores: jest.fn(),
      unregisterNetworkStores: jest.fn(),
    } as unknown as OrbitDBReplicatedDomainEventPublisher;
    const repairCritical = jest.fn().mockResolvedValue({});
    const repairStore = jest.fn().mockResolvedValue({ identities: 1 });
    const runtime = new OrbitDBReplicatedStateRuntime(
      networkRegistry,
      {} as MessageBus,
      publisher,
      replicatedStateRegistry,
      { project: jest.fn() } as unknown as OrbitDBDomainEventProjector,
      {
        repairCritical,
        repairStore,
        repairSecondary: jest.fn().mockResolvedValue({}),
      } as unknown as OrbitDBMetadataHeadRepairer,
    );

    jest.spyOn(OrbitDBReplicatedStateStores, 'open').mockResolvedValue(stores);

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
