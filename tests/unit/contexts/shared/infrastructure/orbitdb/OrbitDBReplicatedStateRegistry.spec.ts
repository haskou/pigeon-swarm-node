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
  contentReplication: Store;
  identities: Store;
  keychains: Store;
  messages: Store;
  notifications: Store;
  stores: OrbitDBReplicatedStateStores;
} {
  const communities = createStore();
  const contentReplication = createStore();
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
    contentReplication,
    keychains,
    messages,
    notifications,
    reactions: createStore(),
    requests: createStore(),
  };

  return {
    communities,
    contentReplication,
    identities,
    keychains,
    messages,
    notifications,
    stores: storeSet as unknown as OrbitDBReplicatedStateStores,
  };
}

describe('OrbitDBReplicatedStateRegistry', () => {
  it('throws when replicated state is not ready yet', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();

    await expect(
      registry.queryDocuments('communities', () => true),
    ).rejects.toMatchObject({
      code: 503020,
      httpCode: 503,
      message:
        'Replicated state is not ready yet. Retry after the node finishes opening and synchronizing replicated state.',
    });
    await expect(
      registry.putDocument('communities', { id: 'community-1' }),
    ).rejects.toMatchObject({
      code: 503020,
      httpCode: 503,
    });
  });

  it('routes documents to the matching network only', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const firstNetwork = createStores();
    const secondNetwork = createStores();

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

    expect(firstNetwork.communities.put).toHaveBeenCalledTimes(1);
    expect(secondNetwork.communities.put).not.toHaveBeenCalled();
    expect(firstNetwork.messages.put).toHaveBeenCalledTimes(1);
    expect(secondNetwork.messages.put).not.toHaveBeenCalled();
    expect(firstNetwork.notifications.put).toHaveBeenCalledTimes(1);
    expect(secondNetwork.notifications.put).toHaveBeenCalledTimes(1);
  });

  it('routes keychain metadata through the owner identity networks', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const firstNetwork = createStores();
    const secondNetwork = createStores();

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

    expect(firstNetwork.keychains.put).not.toHaveBeenCalled();
    expect(secondNetwork.keychains.put).toHaveBeenCalledTimes(1);
  });

  it('finds head documents by key prefix', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const firstNetwork = createStores();

    registry.register('network-1', firstNetwork.stores);

    await registry.putHead('presence:identity-1', {
      id: 'identity-1',
      status: 'available',
    });
    await registry.putHead('notification:notification-1', {
      id: 'notification-1',
    });

    const results = await registry.findHeadsByPrefix('presence:');

    expect(results).toEqual([
      expect.objectContaining({
        id: 'identity-1',
        status: 'available',
      }),
    ]);
  });

  it('does not inspect related documents when direct network ids are present', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const firstNetwork = createStores();
    const secondNetwork = createStores();

    registry.register('network-1', firstNetwork.stores);
    registry.register('network-2', secondNetwork.stores);

    await registry.putDocument('contentReplication', {
      cid: 'bafy',
      id: 'bafy',
      networkIds: ['network-1'],
      ownerIdentityId: 'identity-1',
    });

    expect(firstNetwork.contentReplication.put).toHaveBeenCalledTimes(1);
    expect(secondNetwork.contentReplication.put).not.toHaveBeenCalled();
    expect(firstNetwork.identities.query).not.toHaveBeenCalled();
    expect(secondNetwork.identities.query).not.toHaveBeenCalled();
  });

  it('does not backfill documents from an unsynchronized local store', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const firstNetwork = createStores();

    registry.register('network-1', firstNetwork.stores);

    expect(firstNetwork.communities.put).not.toHaveBeenCalled();
    expect(firstNetwork.messages.put).not.toHaveBeenCalled();
  });
});
