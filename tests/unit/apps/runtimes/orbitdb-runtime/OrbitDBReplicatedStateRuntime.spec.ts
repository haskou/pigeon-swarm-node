import OrbitDBReplicatedStateRuntime from '@app/apps/runtimes/orbitdb-runtime/OrbitDBReplicatedStateRuntime';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import OrbitDBDomainEventProjector from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBDomainEventProjector';
import OrbitDBReplicatedDomainEventPublisher from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedDomainEventPublisher';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { OrbitDBReplicatedStateStores } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateStores';
import Kernel from '@app/Kernel';
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
    conversations: fakeStore(),
    events: fakeStore(),
    heads: fakeStore(),
    identities: fakeStore(),
    ipfsReplication: fakeStore(),
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
    (
      Kernel as unknown as {
        _logs: {
          error: jest.Mock;
          info: jest.Mock;
        };
      }
    )._logs = {
      error: jest.fn(),
      info: jest.fn(),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('waits for IPFS networks without registering a local OrbitDB state store', async () => {
    const networkRegistry = {
      getAll: jest.fn().mockReturnValue([]),
      onNetworkRegistered: jest.fn(),
    } as unknown as IPFSNetworkRegistry;
    const replicatedStateRegistry = {
      register: jest.fn(),
    } as unknown as OrbitDBReplicatedStateRegistry;
    const publisher = {
      registerNetworkStores: jest.fn(),
    } as unknown as OrbitDBReplicatedDomainEventPublisher;
    const runtime = new OrbitDBReplicatedStateRuntime(
      networkRegistry,
      {} as MessageBus,
      publisher,
      replicatedStateRegistry,
      { project: jest.fn() } as unknown as OrbitDBDomainEventProjector,
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
  });
});
