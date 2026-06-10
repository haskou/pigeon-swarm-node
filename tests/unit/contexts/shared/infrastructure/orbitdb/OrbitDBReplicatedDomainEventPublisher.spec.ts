import { KeychainWasPublishedEvent } from '@app/contexts/keychains/domain/events/KeychainWasPublishedEvent';
import OrbitDBDomainEventProjector from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBDomainEventProjector';
import OrbitDBReplicatedDomainEventPublisher from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedDomainEventPublisher';
import { OrbitDBReplicatedStateStores } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateStores';
import { NotificationWasCreatedEvent } from '@app/contexts/notifications/domain/events/NotificationWasCreatedEvent';

type Store = {
  add: jest.Mock;
  all: jest.Mock;
  query: jest.Mock;
};

function store(documents: Record<string, unknown>[] = []): Store {
  return {
    add: jest.fn().mockResolvedValue('ok'),
    all: jest
      .fn()
      .mockResolvedValue(documents.map((value) => ({ value }))),
    query: jest
      .fn()
      .mockImplementation((matcher) =>
        Promise.resolve(documents.filter(matcher)),
      ),
  };
}

function stores(params: {
  identities?: Record<string, unknown>[];
} = {}): {
  events: Store;
  stores: OrbitDBReplicatedStateStores;
} {
  const events = store();
  const storeSet = {
    communities: store(),
    conversations: store(),
    events,
    identities: store(params.identities),
  };

  return {
    events,
    stores: storeSet as unknown as OrbitDBReplicatedStateStores,
  };
}

describe('OrbitDBReplicatedDomainEventPublisher', () => {
  it('publishes network-scoped events to local state and the target network', async () => {
    const local = stores();
    const firstNetwork = stores();
    const secondNetwork = stores();
    const projector = {
      project: jest.fn().mockResolvedValue(undefined),
    } as unknown as OrbitDBDomainEventProjector;
    const publisher = new OrbitDBReplicatedDomainEventPublisher(projector);

    publisher.registerNetworkStores('local', 'local-peer', local.stores);
    publisher.registerNetworkStores(
      'network-1',
      'network-1-peer',
      firstNetwork.stores,
    );
    publisher.registerNetworkStores(
      'network-2',
      'network-2-peer',
      secondNetwork.stores,
    );

    await publisher.publish([
      new NotificationWasCreatedEvent('notification-1', {
        networkId: 'network-1',
        notification: { id: 'notification-1' },
      }),
    ]);

    expect(local.events.add).toHaveBeenCalledTimes(1);
    expect(firstNetwork.events.add).toHaveBeenCalledTimes(1);
    expect(secondNetwork.events.add).not.toHaveBeenCalled();
  });

  it('routes keychain events through the owner identity networks', async () => {
    const local = stores({
      identities: [
        {
          id: 'identity-1',
          identityId: 'identity-1',
          networkIds: ['network-2'],
        },
      ],
    });
    const firstNetwork = stores();
    const secondNetwork = stores();
    const projector = {
      project: jest.fn().mockResolvedValue(undefined),
    } as unknown as OrbitDBDomainEventProjector;
    const publisher = new OrbitDBReplicatedDomainEventPublisher(projector);

    publisher.registerNetworkStores('local', 'local-peer', local.stores);
    publisher.registerNetworkStores(
      'network-1',
      'network-1-peer',
      firstNetwork.stores,
    );
    publisher.registerNetworkStores(
      'network-2',
      'network-2-peer',
      secondNetwork.stores,
    );

    await publisher.publish([
      new KeychainWasPublishedEvent('identity-1', {
        externalIdentifier: 'bafk-keychain',
        ownerIdentityId: 'identity-1',
      }),
    ]);

    expect(local.events.add).toHaveBeenCalledTimes(1);
    expect(firstNetwork.events.add).not.toHaveBeenCalled();
    expect(secondNetwork.events.add).toHaveBeenCalledTimes(1);
  });

  it('keeps unresolved events in local state only', async () => {
    const local = stores();
    const firstNetwork = stores();
    const projector = {
      project: jest.fn().mockResolvedValue(undefined),
    } as unknown as OrbitDBDomainEventProjector;
    const publisher = new OrbitDBReplicatedDomainEventPublisher(projector);

    publisher.registerNetworkStores('local', 'local-peer', local.stores);
    publisher.registerNetworkStores(
      'network-1',
      'network-1-peer',
      firstNetwork.stores,
    );

    await publisher.publish([
      new NotificationWasCreatedEvent('notification-1', {
        notification: { id: 'notification-1' },
      }),
    ]);

    expect(local.events.add).toHaveBeenCalledTimes(1);
    expect(firstNetwork.events.add).not.toHaveBeenCalled();
  });
});
