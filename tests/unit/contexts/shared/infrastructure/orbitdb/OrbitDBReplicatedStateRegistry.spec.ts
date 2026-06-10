import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { OrbitDBReplicatedStateStores } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateStores';

type Entry = {
  key?: string;
  value: Record<string, unknown>;
};

type Store = {
  all: jest.Mock<Promise<Entry[]>>;
  get: jest.Mock<Promise<Record<string, unknown> | undefined>, [string]>;
  put: jest.Mock<Promise<string>, [string | Record<string, unknown>, unknown?]>;
  query: jest.Mock<
    Promise<Record<string, unknown>[]>,
    [(document: Record<string, unknown>) => boolean]
  >;
};

function createStore(): Store {
  const entries: Entry[] = [];

  return {
    all: jest.fn(async () => entries),
    get: jest.fn(async (key: string) =>
      entries.find((entry) => entry.key === key)?.value,
    ),
    put: jest.fn(
      async (
        keyOrDocument: string | Record<string, unknown>,
        value?: unknown,
      ) => {
        const key =
          typeof keyOrDocument === 'string'
            ? keyOrDocument
            : String(keyOrDocument.id);
        const document =
          typeof keyOrDocument === 'string'
            ? (value as Record<string, unknown>)
            : keyOrDocument;
        const existingIndex = entries.findIndex((entry) => entry.key === key);

        if (existingIndex >= 0) {
          entries[existingIndex] = { key, value: document };
        } else {
          entries.push({ key, value: document });
        }

        return key;
      },
    ),
    query: jest.fn(async (matcher) =>
      entries.map((entry) => entry.value).filter(matcher),
    ),
  };
}

function createStores(): {
  communities: Store;
  identities: Store;
  keychains: Store;
  messages: Store;
  notifications: Store;
  stores: OrbitDBReplicatedStateStores;
} {
  const communities = createStore();
  const identities = createStore();
  const keychains = createStore();
  const messages = createStore();
  const notifications = createStore();
  const storeSet = {
    communities,
    conversations: createStore(),
    events: createStore(),
    heads: createStore(),
    identities,
    ipfsReplication: createStore(),
    keychains,
    messages,
    notifications,
    reactions: createStore(),
    requests: createStore(),
  };

  return {
    communities,
    identities,
    keychains,
    messages,
    notifications,
    stores: storeSet as unknown as OrbitDBReplicatedStateStores,
  };
}

describe('OrbitDBReplicatedStateRegistry', () => {
  it('routes documents to local state and the matching network only', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const local = createStores();
    const firstNetwork = createStores();
    const secondNetwork = createStores();

    registry.register('local', local.stores);
    registry.register('network-1', firstNetwork.stores);
    registry.register('network-2', secondNetwork.stores);

    await registry.putDocument('communities', {
      id: 'community-1',
      networkId: 'network-1',
    });
    await registry.putDocument('messages', {
      communityId: 'community-1',
      id: 'message-1',
      scopeType: 'community_channel',
    });
    await registry.putDocument('notifications', {
      id: 'local-notification',
    });

    expect(local.communities.put).toHaveBeenCalledTimes(1);
    expect(firstNetwork.communities.put).toHaveBeenCalledTimes(1);
    expect(secondNetwork.communities.put).not.toHaveBeenCalled();
    expect(local.messages.put).toHaveBeenCalledTimes(1);
    expect(firstNetwork.messages.put).toHaveBeenCalledTimes(1);
    expect(secondNetwork.messages.put).not.toHaveBeenCalled();
    expect(local.notifications.put).toHaveBeenCalledTimes(1);
    expect(firstNetwork.notifications.put).not.toHaveBeenCalled();
    expect(secondNetwork.notifications.put).not.toHaveBeenCalled();
  });

  it('routes keychain metadata through the owner identity networks', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const local = createStores();
    const firstNetwork = createStores();
    const secondNetwork = createStores();

    registry.register('local', local.stores);
    registry.register('network-1', firstNetwork.stores);
    registry.register('network-2', secondNetwork.stores);

    await registry.putDocument('identities', {
      id: 'identity-1',
      identityId: 'identity-1',
      networkIds: ['network-2'],
    });
    await registry.putDocument('keychains', {
      id: 'identity-1',
      ownerIdentityId: 'identity-1',
    });

    expect(local.keychains.put).toHaveBeenCalledTimes(1);
    expect(firstNetwork.keychains.put).not.toHaveBeenCalled();
    expect(secondNetwork.keychains.put).toHaveBeenCalledTimes(1);
  });

  it('backfills matching local documents when a network store is registered', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const local = createStores();
    const firstNetwork = createStores();

    registry.register('local', local.stores);

    await registry.putDocument('communities', {
      id: 'community-1',
      networkId: 'network-1',
    });
    await registry.putDocument('messages', {
      communityId: 'community-1',
      id: 'message-1',
      scopeType: 'community_channel',
    });

    registry.register('network-1', firstNetwork.stores);
    await registry.backfillLocalStateToNetwork('network-1');

    expect(firstNetwork.communities.put).toHaveBeenCalledWith({
      id: 'community-1',
      networkId: 'network-1',
    });
    expect(firstNetwork.messages.put).toHaveBeenCalledWith({
      communityId: 'community-1',
      id: 'message-1',
      scopeType: 'community_channel',
    });
  });
});
