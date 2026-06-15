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
  communities?: Record<string, unknown>[];
  conversations?: Record<string, unknown>[];
  identities?: Record<string, unknown>[];
} = {}): {
  events: Store;
  stores: OrbitDBReplicatedStateStores;
} {
  const events = store();
  const storeSet = {
    communities: store(params.communities),
    conversations: store(params.conversations),
    events,
    identities: store(params.identities),
  };

  return {
    events,
    stores: storeSet as unknown as OrbitDBReplicatedStateStores,
  };
}

describe('OrbitDBReplicatedDomainEventPublisher', () => {
  it('publishes network-scoped events to the target network', async () => {
    const firstNetwork = stores();
    const secondNetwork = stores();
    const projector = {
      project: jest.fn().mockResolvedValue(undefined),
    } as unknown as OrbitDBDomainEventProjector;
    const publisher = new OrbitDBReplicatedDomainEventPublisher(projector);

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

    expect(firstNetwork.events.add).toHaveBeenCalledTimes(1);
    expect(secondNetwork.events.add).not.toHaveBeenCalled();
    expect(firstNetwork.stores.communities.query).not.toHaveBeenCalled();
    expect(firstNetwork.stores.conversations.query).not.toHaveBeenCalled();
    expect(firstNetwork.stores.identities.query).not.toHaveBeenCalled();
    expect(secondNetwork.stores.communities.query).not.toHaveBeenCalled();
    expect(secondNetwork.stores.conversations.query).not.toHaveBeenCalled();
    expect(secondNetwork.stores.identities.query).not.toHaveBeenCalled();
  });

  it('routes keychain events through the owner identity networks', async () => {
    const firstNetwork = stores();
    const secondNetwork = stores({
      identities: [
        {
          id: 'identity-1',
          identityId: 'identity-1',
          networkIds: ['network-2'],
        },
      ],
    });
    const projector = {
      project: jest.fn().mockResolvedValue(undefined),
    } as unknown as OrbitDBDomainEventProjector;
    const publisher = new OrbitDBReplicatedDomainEventPublisher(projector);

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

    expect(firstNetwork.events.add).not.toHaveBeenCalled();
    expect(secondNetwork.events.add).toHaveBeenCalledTimes(1);
  });

  it('publishes unresolved events to every registered network', async () => {
    const firstNetwork = stores();
    const secondNetwork = stores();
    const projector = {
      project: jest.fn().mockResolvedValue(undefined),
    } as unknown as OrbitDBDomainEventProjector;
    const publisher = new OrbitDBReplicatedDomainEventPublisher(projector);

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
        notification: { id: 'notification-1' },
      }),
    ]);

    expect(firstNetwork.events.add).toHaveBeenCalledTimes(1);
    expect(secondNetwork.events.add).toHaveBeenCalledTimes(1);
  });

  it('publishes one event to independent networks concurrently', async () => {
    const firstNetwork = stores();
    const secondNetwork = stores();
    const delayedWrite = deferred<string>();
    const projector = {
      project: jest.fn().mockResolvedValue(undefined),
    } as unknown as OrbitDBDomainEventProjector;
    const publisher = new OrbitDBReplicatedDomainEventPublisher(projector);

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
    firstNetwork.events.add.mockImplementationOnce(
      async () => delayedWrite.promise,
    );

    const publish = publisher.publish([
      new NotificationWasCreatedEvent('notification-1', {
        notification: { id: 'notification-1' },
      }),
    ]);

    await flushPromises();

    expect(firstNetwork.events.add).toHaveBeenCalledTimes(1);
    expect(secondNetwork.events.add).toHaveBeenCalledTimes(1);

    delayedWrite.resolve('ok');
    await publish;
  });
});

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
} {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });

  return { promise, resolve };
}

async function flushPromises(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
