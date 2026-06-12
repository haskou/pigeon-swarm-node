import Kernel from '@app/Kernel';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { OrbitDBReplicatedStateStores } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateStores';
import HttpRequestContext from '@app/shared/infrastructure/express/HttpRequestContext';
import WinstonLogger from '@app/shared/infrastructure/logs/WinstonLogger';
import { Request } from 'express';
import { mock, MockProxy } from 'jest-mock-extended';

type Entry = {
  key?: string;
  value: Record<string, unknown>;
};

type Store = {
  all: jest.Mock<Promise<Entry[]>>;
  emitUpdate(entry: { payload?: { value?: unknown } }): void;
  events: {
    on: jest.Mock<
      void,
      ['update', (entry: { payload?: { value?: unknown } }) => void]
    >;
  };
  get: jest.Mock<Promise<Record<string, unknown> | undefined>, [string]>;
  put: jest.Mock<Promise<string>, [string | Record<string, unknown>, unknown?]>;
  query: jest.Mock<
    Promise<Record<string, unknown>[]>,
    [(document: Record<string, unknown>) => boolean]
  >;
};

function createStore(): Store {
  const entries: Entry[] = [];
  const updateHandlers: Array<
    (entry: { payload?: { value?: unknown } }) => void
  > = [];

  return {
    all: jest.fn(async () => entries),
    emitUpdate(entry): void {
      updateHandlers.forEach((handler) => handler(entry));
    },
    events: {
      on: jest.fn((_event, handler) => {
        updateHandlers.push(handler);
      }),
    },
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
  heads: Store;
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
  const heads = createStore();
  const storeSet = {
    communities,
    conversations: createStore(),
    events: createStore(),
    heads,
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
    heads,
    messages,
    notifications,
    stores: storeSet as unknown as OrbitDBReplicatedStateStores,
  };
}

describe('OrbitDBReplicatedStateRegistry', () => {
  let logger: MockProxy<WinstonLogger>;

  beforeEach(() => {
    logger = mock<WinstonLogger>();
    jest.spyOn(Kernel, 'logger', 'get').mockReturnValue(logger);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

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

    await registry.register('network-1', firstNetwork.stores);
    await registry.register('network-2', secondNetwork.stores);

    await registry.putDocument('communities', {
      id: 'community-1',
      networkId: 'network-1',
    });
    await registry.putHead(
      'community:community-1',
      {
        id: 'community-1',
        networkId: 'network-1',
      },
      ['network-1'],
    );
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

    await registry.register('network-1', firstNetwork.stores);
    await registry.register('network-2', secondNetwork.stores);

    await registry.putHead(
      'identity:identity-1',
      {
        id: 'identity-1',
        identityId: 'identity-1',
        networkIds: ['network-2'],
      },
      ['network-2'],
    );
    await registry.putDocument('keychains', {
      id: 'identity-1',
      ownerIdentityId: 'identity-1',
    });

    expect(firstNetwork.keychains.put).not.toHaveBeenCalled();
    expect(secondNetwork.keychains.put).toHaveBeenCalledTimes(1);
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

  it('uses related heads before scanning documents to infer network ids', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const firstNetwork = createStores();
    const secondNetwork = createStores();

    registry.register('network-1', firstNetwork.stores);
    registry.register('network-2', secondNetwork.stores);

    await registry.putHead(
      'community:community-1',
      {
        id: 'community-1',
        networkId: 'network-2',
      },
      ['network-2'],
    );
    firstNetwork.communities.query.mockClear();
    secondNetwork.communities.query.mockClear();

    await registry.putDocument('messages', {
      communityId: 'community-1',
      id: 'message-1',
      scopeType: 'community_channel',
    });

    expect(firstNetwork.messages.put).not.toHaveBeenCalled();
    expect(secondNetwork.messages.put).toHaveBeenCalledTimes(1);
    expect(firstNetwork.communities.query).not.toHaveBeenCalled();
    expect(secondNetwork.communities.query).not.toHaveBeenCalled();
  });

  it('does not backfill documents from an unsynchronized local store', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const firstNetwork = createStores();

    registry.register('network-1', firstNetwork.stores);

    expect(firstNetwork.communities.put).not.toHaveBeenCalled();
    expect(firstNetwork.messages.put).not.toHaveBeenCalled();
  });

  it('serves heads from cache after writing them', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const firstNetwork = createStores();

    registry.register('network-1', firstNetwork.stores);

    await registry.putHead('keychain:identity-1', {
      id: 'keychain:identity-1',
      networkId: 'network-1',
      updatedAt: 1,
    });
    firstNetwork.heads.get.mockClear();
    firstNetwork.heads.all.mockClear();

    await expect(registry.findHead('keychain:identity-1')).resolves.toEqual({
      id: 'keychain:identity-1',
      networkId: 'network-1',
      updatedAt: 1,
    });
    expect(firstNetwork.heads.get).not.toHaveBeenCalled();
    expect(firstNetwork.heads.all).not.toHaveBeenCalled();
  });

  it('updates the head cache from replicated head updates', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const firstNetwork = createStores();

    registry.register('network-1', firstNetwork.stores);
    firstNetwork.heads.emitUpdate({
      payload: {
        value: {
          key: 'conversation:conversation-1',
          value: {
            id: 'conversation:conversation-1',
            networkId: 'network-1',
            updatedAt: 1,
          },
        },
      },
    });
    firstNetwork.heads.get.mockClear();
    firstNetwork.heads.all.mockClear();

    await expect(registry.findHead('conversation:conversation-1')).resolves.toEqual(
      {
        id: 'conversation:conversation-1',
        networkId: 'network-1',
        updatedAt: 1,
      },
    );
    expect(firstNetwork.heads.get).not.toHaveBeenCalled();
    expect(firstNetwork.heads.all).not.toHaveBeenCalled();
  });

  it('does not replace a newer cached head with an older replicated update', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const firstNetwork = createStores();

    registry.register('network-1', firstNetwork.stores);

    await registry.putHead('community:community-1', {
      id: 'community-1',
      name: 'new',
      updatedAt: 2,
    });
    firstNetwork.heads.emitUpdate({
      payload: {
        value: {
          key: 'community:community-1',
          value: {
            id: 'community-1',
            name: 'old',
            updatedAt: 1,
          },
        },
      },
    });

    await expect(registry.findHead('community:community-1')).resolves.toEqual({
      id: 'community-1',
      name: 'new',
      updatedAt: 2,
    });
  });

  it('warns when an HTTP request performs a slow document query', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const firstNetwork = createStores();
    const request = {
      method: 'GET',
      originalUrl: '/communities?limit=30',
      path: '/communities',
      url: '/communities?limit=30',
    } as Request;

    jest.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(1150);
    registry.register('network-1', firstNetwork.stores);
    await registry.putDocument('communities', {
      id: 'community-1',
      networkId: 'network-1',
    });

    await HttpRequestContext.run(request, () =>
      registry.queryDocuments(
        'communities',
        (document) => document.id === 'community-1',
        {
          operation: 'test.communities.list',
        },
      ),
    );

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'OrbitDB queryDocuments slow: store=communities',
      ),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('httpRequest="GET /communities?limit=30"'),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('operation="test.communities.list"'),
    );
  });

  it('does not warn for fast HTTP document queries', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const firstNetwork = createStores();
    const request = {
      method: 'GET',
      originalUrl: '/communities?limit=30',
      path: '/communities',
      url: '/communities?limit=30',
    } as Request;

    jest.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(1020);
    registry.register('network-1', firstNetwork.stores);
    await registry.putDocument('communities', {
      id: 'community-1',
      networkId: 'network-1',
    });

    await HttpRequestContext.run(request, () =>
      registry.queryDocuments(
        'communities',
        (document) => document.id === 'community-1',
        {
          operation: 'test.communities.list',
        },
      ),
    );

    expect(logger.warn).not.toHaveBeenCalled();
  });
});
