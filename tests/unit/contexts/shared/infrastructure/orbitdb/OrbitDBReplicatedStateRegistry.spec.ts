import Kernel from '@haskou/ddd-kernel';
import OrbitDBReplicatedHeadCache, {
  OrbitDBReplicatedHeadCacheEntry,
} from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedHeadCache';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { OrbitDBPrivateNetworkStores } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBPrivateNetworkStores';
import HttpRequestContext from '@app/shared/infrastructure/express/HttpRequestContext';
import WinstonLogger from '@app/shared/infrastructure/logs/WinstonLogger';
import { Request } from 'express';
import { mock, MockProxy } from 'jest-mock-extended';

type Entry = {
  key?: string;
  value: Record<string, unknown>;
};

class InMemoryOrbitDBReplicatedHeadCache extends OrbitDBReplicatedHeadCache {
  private readonly entries: Array<
    OrbitDBReplicatedHeadCacheEntry & { networkId: string }
  > = [];
  private readonly warmNetworkIds = new Set<string>();

  public async findByNetworkId(
    networkId: string,
  ): Promise<OrbitDBReplicatedHeadCacheEntry[]> {
    return this.entries
      .filter((entry) => entry.networkId === networkId)
      .map((entry) => ({
        key: entry.key,
        value: entry.value,
      }));
  }

  public async isWarm(networkId: string): Promise<boolean> {
    return this.warmNetworkIds.has(networkId);
  }

  public async markWarm(networkId: string): Promise<void> {
    this.warmNetworkIds.add(networkId);
  }

  public async save(
    networkId: string,
    key: string,
    value: Record<string, unknown>,
  ): Promise<void> {
    const currentIndex = this.entries.findIndex(
      (entry) => entry.networkId === networkId && entry.key === key,
    );
    const entry = { key, networkId, value };

    if (currentIndex >= 0) {
      this.entries[currentIndex] = entry;

      return;
    }

    this.entries.push(entry);
  }
}

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
    get: jest.fn(
      async (key: string) => entries.find((entry) => entry.key === key)?.value,
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
  stores: OrbitDBPrivateNetworkStores;
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
    stores: storeSet as unknown as OrbitDBPrivateNetworkStores,
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

  it('writes documents to independent networks concurrently', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const firstNetwork = createStores();
    const secondNetwork = createStores();
    const delayedWrite = deferred<string>();

    await registry.register('network-1', firstNetwork.stores);
    await registry.register('network-2', secondNetwork.stores);
    firstNetwork.communities.put.mockImplementationOnce(
      async () => delayedWrite.promise,
    );

    const write = registry.putDocument('communities', {
      id: 'community-1',
    });

    await flushPromises();

    expect(firstNetwork.communities.put).toHaveBeenCalledTimes(1);
    expect(secondNetwork.communities.put).toHaveBeenCalledTimes(1);

    delayedWrite.resolve('ok');
    await write;
  });

  it('replicates documents in background without waiting for persistence', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const firstNetwork = createStores();
    const delayedWrite = deferred<string>();

    await registry.register('network-1', firstNetwork.stores);
    firstNetwork.communities.put.mockImplementationOnce(
      async () => delayedWrite.promise,
    );

    const result = await Promise.race([
      registry
        .replicateDocumentInBackground('communities', {
          id: 'community-1',
          networkId: 'network-1',
        })
        .then(() => 'written'),
      new Promise((resolve) => setTimeout(() => resolve('blocked'), 10)),
    ]);

    expect(result).toBe('written');
    expect(firstNetwork.communities.put).toHaveBeenCalledWith({
      id: 'community-1',
      networkId: 'network-1',
    });

    delayedWrite.resolve('ok');
    await flushPromises();
  });

  it('writes heads to independent networks concurrently', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const firstNetwork = createStores();
    const secondNetwork = createStores();
    const delayedWrite = deferred<string>();

    await registry.register('network-1', firstNetwork.stores);
    await registry.register('network-2', secondNetwork.stores);
    firstNetwork.heads.put.mockImplementationOnce(
      async () => delayedWrite.promise,
    );

    const write = registry.putHead('community:community-1', {
      id: 'community-1',
      updatedAt: 1,
    });

    await flushPromises();

    expect(firstNetwork.heads.put).toHaveBeenCalledTimes(1);
    expect(secondNetwork.heads.put).toHaveBeenCalledTimes(1);

    delayedWrite.resolve('ok');
    await write;
  });

  it('does not rewrite index heads when only the technical head timestamp changes', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const network = createStores();

    await registry.register('network-1', network.stores);

    await registry.putHead('messages:conversation-1', {
      id: 'messages:conversation-1',
      messages: [
        {
          id: 'message-1',
          receivedAt: 1,
        },
      ],
      updatedAt: 1,
    });
    network.heads.put.mockClear();

    await registry.putHead('messages:conversation-1', {
      id: 'messages:conversation-1',
      messages: [
        {
          id: 'message-1',
          receivedAt: 1,
        },
      ],
      updatedAt: 2,
    });

    expect(network.heads.put).not.toHaveBeenCalled();
    await expect(registry.findHead('messages:conversation-1')).resolves.toEqual(
      {
        id: 'messages:conversation-1',
        messages: [
          {
            id: 'message-1',
            receivedAt: 1,
          },
        ],
        updatedAt: 1,
      },
    );
  });

  it('rewrites index heads when indexed records change', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const network = createStores();

    await registry.register('network-1', network.stores);

    await registry.putHead('messages:conversation-1', {
      id: 'messages:conversation-1',
      messages: [
        {
          id: 'message-1',
          receivedAt: 1,
        },
      ],
      updatedAt: 1,
    });
    network.heads.put.mockClear();

    await registry.putHead('messages:conversation-1', {
      id: 'messages:conversation-1',
      messages: [
        {
          id: 'message-1',
          receivedAt: 2,
        },
      ],
      updatedAt: 2,
    });

    expect(network.heads.put).toHaveBeenCalledTimes(1);
  });

  it('caches heads locally without writing to replicated heads', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const network = createStores();

    await registry.register('network-1', network.stores);

    registry.cacheHeadLocally(
      'presence:identity-1',
      {
        id: 'identity-1',
        identityId: 'identity-1',
        networkIds: ['network-1'],
        status: 'available',
        updatedAt: 1780000000000,
      },
      ['network-1'],
    );

    await expect(registry.findHead('presence:identity-1')).resolves.toEqual(
      expect.objectContaining({
        identityId: 'identity-1',
        status: 'available',
      }),
    );
    expect(network.heads.put).not.toHaveBeenCalled();
  });

  it('replicates cached heads in background', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const network = createStores();
    const delayedWrite = deferred<string>();

    await registry.register('network-1', network.stores);
    network.heads.put.mockImplementationOnce(async () => delayedWrite.promise);

    registry.replicateHeadInBackground(
      'presence:identity-1',
      {
        id: 'identity-1',
        identityId: 'identity-1',
        networkIds: ['network-1'],
        status: 'available',
        updatedAt: 1780000000000,
      },
      ['network-1'],
    );

    await expect(registry.findHead('presence:identity-1')).resolves.toEqual(
      expect.objectContaining({
        identityId: 'identity-1',
        status: 'available',
      }),
    );
    await flushPromises();

    expect(network.heads.put).toHaveBeenCalledTimes(1);
    delayedWrite.resolve('ok');
    await flushPromises();
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

  it('uses the recipient identity head when a notification related document is not cached', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const firstNetwork = createStores();
    const secondNetwork = createStores();

    await registry.register('network-1', firstNetwork.stores);
    await registry.register('network-2', secondNetwork.stores);
    await registry.putHead(
      'identity:recipient-1',
      {
        id: 'recipient-1',
        identityId: 'recipient-1',
        networkIds: ['network-2'],
      },
      ['network-2'],
    );
    firstNetwork.notifications.put.mockClear();
    secondNetwork.notifications.put.mockClear();

    await registry.putDocument('notifications', {
      id: 'notification-1',
      payload: {
        communityId: 'community-1',
      },
      recipientIdentityId: 'recipient-1',
    });

    expect(firstNetwork.notifications.put).not.toHaveBeenCalled();
    expect(secondNetwork.notifications.put).toHaveBeenCalledTimes(1);
  });

  it('uses the notification payload inviter identity head when the recipient is not cached', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const firstNetwork = createStores();
    const secondNetwork = createStores();

    await registry.register('network-1', firstNetwork.stores);
    await registry.register('network-2', secondNetwork.stores);
    await registry.putHead(
      'identity:inviter-1',
      {
        id: 'inviter-1',
        identityId: 'inviter-1',
        networkIds: ['network-2'],
      },
      ['network-2'],
    );
    firstNetwork.notifications.put.mockClear();
    secondNetwork.notifications.put.mockClear();

    await registry.putDocument('notifications', {
      id: 'notification-1',
      payload: {
        communityId: 'community-1',
        inviterIdentityId: 'inviter-1',
      },
      recipientIdentityId: 'recipient-1',
    });

    expect(firstNetwork.notifications.put).not.toHaveBeenCalled();
    expect(secondNetwork.notifications.put).toHaveBeenCalledTimes(1);
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

  it('does not read replicated head stores on head cache misses', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const firstNetwork = createStores();

    await registry.register('network-1', firstNetwork.stores);
    firstNetwork.heads.get.mockImplementation(() => {
      throw new Error('Head cache misses should not read replicated stores');
    });

    await expect(registry.findHead('identity-handle:202020')).resolves.toBe(
      undefined,
    );
    expect(firstNetwork.heads.get).not.toHaveBeenCalled();
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

    await expect(
      registry.findHead('conversation:conversation-1'),
    ).resolves.toEqual({
      id: 'conversation:conversation-1',
      networkId: 'network-1',
      updatedAt: 1,
    });
    expect(firstNetwork.heads.get).not.toHaveBeenCalled();
    expect(firstNetwork.heads.all).not.toHaveBeenCalled();
  });

  it('derives identity head keys from replicated head updates without explicit keys', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const firstNetwork = createStores();

    registry.register('network-1', firstNetwork.stores);
    firstNetwork.heads.emitUpdate({
      payload: {
        value: {
          cid: 'identity-v5',
          handle: 'hasko',
          id: 'identity-1',
          identityId: 'identity-1',
          receivedAt: 100,
          version: 5,
        },
      },
    });

    await expect(registry.findHead('identity:identity-1')).resolves.toEqual(
      expect.objectContaining({
        cid: 'identity-v5',
        version: 5,
      }),
    );
    await expect(registry.findHead('identity-handle:hasko')).resolves.toEqual(
      expect.objectContaining({
        cid: 'identity-v5',
        version: 5,
      }),
    );
  });

  it('does not derive identity head keys from non-identity records', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const firstNetwork = createStores();

    registry.register('network-1', firstNetwork.stores);
    firstNetwork.heads.emitUpdate({
      payload: {
        value: {
          cid: 'bafyimage',
          contentType: 'image/png',
          handle: 'avatar',
          id: 'bafyimage',
          networkIds: ['network-1'],
          receivedAt: 100,
          sizeBytes: 123,
          version: 1,
        },
      },
    });

    await expect(
      registry.findHead('identity:bafyimage'),
    ).resolves.toBeUndefined();
    await expect(
      registry.findHead('identity-handle:avatar'),
    ).resolves.toBeUndefined();
    await expect(registry.findHead('bafyimage')).resolves.toEqual(
      expect.objectContaining({
        cid: 'bafyimage',
        version: 1,
      }),
    );
  });

  it('derives identity head keys from projected identity records without explicit identityId', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const firstNetwork = createStores();

    registry.register('network-1', firstNetwork.stores);
    firstNetwork.heads.emitUpdate({
      payload: {
        value: {
          cid: 'identity-v1',
          handle: 'hasko',
          id: 'identity-1',
          lastEventId: 'event-1',
          networkIds: ['network-1'],
          receivedAt: 100,
          version: 1,
        },
      },
    });

    await expect(registry.findHead('identity:identity-1')).resolves.toEqual(
      expect.objectContaining({
        cid: 'identity-v1',
        id: 'identity-1',
      }),
    );
    await expect(registry.findHead('identity-handle:hasko')).resolves.toEqual(
      expect.objectContaining({
        cid: 'identity-v1',
        id: 'identity-1',
      }),
    );
  });

  it('derives keychain head keys from replicated head updates without explicit keys', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const firstNetwork = createStores();

    registry.register('network-1', firstNetwork.stores);
    firstNetwork.heads.emitUpdate({
      payload: {
        value: {
          cid: 'keychain-v3',
          id: 'keychain-v3',
          ownerIdentityId: 'identity-1',
          receivedAt: 100,
          version: 3,
        },
      },
    });

    await expect(registry.findHead('keychain:identity-1')).resolves.toEqual(
      expect.objectContaining({
        cid: 'keychain-v3',
        version: 3,
      }),
    );
    await expect(
      registry.findHead('keychain-cid:keychain-v3'),
    ).resolves.toEqual(
      expect.objectContaining({
        cid: 'keychain-v3',
        version: 3,
      }),
    );
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

  it('merges replicated indexed head records without resurrecting stale records', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const firstNetwork = createStores();
    const key = 'community-channel-message-index:community-1:channel-1';

    await registry.register('network-1', firstNetwork.stores);
    await registry.putHead(
      key,
      {
        id: key,
        messages: [
          {
            encryptedPayload: 'encrypted-community-channel-message-payload',
            id: 'message-1',
            receivedAt: 10,
          },
        ],
        updatedAt: 10,
      },
      ['network-1'],
    );
    registry.cacheHeadLocally(
      key,
      {
        id: key,
        messages: [
          {
            deleted: true,
            deletedAt: 30,
            encryptedPayload: 'encrypted-community-channel-message-payload',
            id: 'message-1',
            receivedAt: 10,
          },
        ],
        updatedAt: 31,
      },
      ['network-1'],
    );
    firstNetwork.heads.emitUpdate({
      payload: {
        value: {
          key,
          value: {
            id: key,
            messages: [
              {
                encryptedPayload: 'encrypted-community-channel-message-payload',
                id: 'message-1',
                receivedAt: 10,
              },
              {
                id: 'message-deleted-1',
                receivedAt: 20,
                targetMessageId: 'message-1',
              },
            ],
            updatedAt: 40,
          },
        },
      },
    });

    await expect(registry.findHead(key)).resolves.toEqual({
      id: key,
      messages: [
        {
          deleted: true,
          deletedAt: 30,
          encryptedPayload: 'encrypted-community-channel-message-payload',
          id: 'message-1',
          receivedAt: 10,
        },
        {
          id: 'message-deleted-1',
          receivedAt: 20,
          targetMessageId: 'message-1',
        },
      ],
      updatedAt: 40,
    });
  });

  it.each(['pins', 'reactions'])(
    'merges replicated %s head records without resurrecting stale tombstones',
    async (collectionName) => {
      const registry = new OrbitDBReplicatedStateRegistry();
      const firstNetwork = createStores();
      const key = `conversation-${collectionName}-index:conversation-1`;

      await registry.register('network-1', firstNetwork.stores);
      registry.cacheHeadLocally(
        key,
        {
          id: key,
          [collectionName]: [
            {
              id: `${collectionName}-1`,
              removed: true,
              updatedAt: 30,
            },
          ],
          updatedAt: 31,
        },
        ['network-1'],
      );
      firstNetwork.heads.emitUpdate({
        payload: {
          value: {
            key,
            value: {
              id: key,
              [collectionName]: [
                {
                  createdAt: 10,
                  id: `${collectionName}-1`,
                },
              ],
              updatedAt: 40,
            },
          },
        },
      });

      await expect(registry.findHead(key)).resolves.toEqual({
        id: key,
        [collectionName]: [
          {
            id: `${collectionName}-1`,
            removed: true,
            updatedAt: 30,
          },
        ],
        updatedAt: 40,
      });
    },
  );

  it('does not merge aggregate record arrays as index collections', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const firstNetwork = createStores();

    await registry.register('network-1', firstNetwork.stores);
    registry.cacheHeadLocally('call:call-1', {
      id: 'call-1',
      participants: [{ identityId: 'identity-1', status: 'ringing' }],
      updatedAt: 10,
    });
    registry.cacheHeadLocally('call:call-1', {
      id: 'call-1',
      participants: [
        {
          identityId: 'identity-1',
          joinedAt: 20,
          lastSeenAt: 20,
          status: 'joined',
        },
      ],
      updatedAt: 20,
    });

    await expect(registry.findHead('call:call-1')).resolves.toEqual({
      id: 'call-1',
      participants: [
        {
          identityId: 'identity-1',
          joinedAt: 20,
          lastSeenAt: 20,
          status: 'joined',
        },
      ],
      updatedAt: 20,
    });
  });

  it('uses edited timestamps when merging indexed head records', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const firstNetwork = createStores();
    const key = 'community-channel-message-index:community-1:channel-1';

    await registry.register('network-1', firstNetwork.stores);
    registry.cacheHeadLocally(key, {
      id: key,
      messages: [
        {
          editedAt: 30,
          encryptedPayload: 'edited-community-channel-message-payload',
          id: 'message-1',
        },
      ],
      updatedAt: 31,
    });
    firstNetwork.heads.emitUpdate({
      payload: {
        value: {
          key,
          value: {
            id: key,
            messages: [
              {
                encryptedPayload: 'encrypted-community-channel-message-payload',
                id: 'message-1',
                receivedAt: 20,
              },
            ],
            updatedAt: 40,
          },
        },
      },
    });

    await expect(registry.findHead(key)).resolves.toEqual({
      id: key,
      messages: [
        {
          editedAt: 30,
          encryptedPayload: 'edited-community-channel-message-payload',
          id: 'message-1',
        },
      ],
      updatedAt: 40,
    });
  });

  it('does not replace a higher version cached head with a lower version replicated update', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const firstNetwork = createStores();

    registry.register('network-1', firstNetwork.stores);

    await registry.putHead('identity:identity-1', {
      cid: 'identity-v5',
      id: 'identity-1',
      identityId: 'identity-1',
      receivedAt: 100,
      version: 5,
    });
    firstNetwork.heads.emitUpdate({
      payload: {
        value: {
          key: 'identity:identity-1',
          value: {
            cid: 'identity-v1',
            id: 'identity-1',
            identityId: 'identity-1',
            receivedAt: 200,
            version: 1,
          },
        },
      },
    });

    await expect(registry.findHead('identity:identity-1')).resolves.toEqual({
      cid: 'identity-v5',
      id: 'identity-1',
      identityId: 'identity-1',
      receivedAt: 100,
      version: 5,
    });
  });

  it('restores heads from the local cache before rebuilding OrbitDB heads', async () => {
    const headCache = new InMemoryOrbitDBReplicatedHeadCache();
    const registry = OrbitDBReplicatedStateRegistry.withHeadCache(headCache);
    const firstNetwork = createStores();
    let releaseHeadScan = (): void => undefined;
    let headScanResolved = false;

    await headCache.save('network-1', 'community:community-1', {
      id: 'community-1',
      networkId: 'network-1',
      updatedAt: 1,
    });
    await headCache.markWarm('network-1');
    firstNetwork.heads.all.mockImplementation(
      async () =>
        new Promise<Entry[]>((resolve) => {
          releaseHeadScan = () => {
            headScanResolved = true;
            resolve([
              {
                key: 'community:community-2',
                value: {
                  id: 'community-2',
                  networkId: 'network-1',
                  updatedAt: 1,
                },
              },
            ]);
          };
        }),
    );

    await registry.register('network-1', firstNetwork.stores);

    expect(registry.findCachedHeadsByPrefix('community:')).toEqual([
      {
        id: 'community-1',
        networkId: 'network-1',
        updatedAt: 1,
      },
    ]);
    expect(firstNetwork.heads.all).toHaveBeenCalledTimes(1);
    expect(headScanResolved).toBe(false);

    releaseHeadScan();
    await Promise.resolve();
    await Promise.resolve();
  });

  it('restores derived identity handle heads from the local cache', async () => {
    const headCache = new InMemoryOrbitDBReplicatedHeadCache();
    const registry = OrbitDBReplicatedStateRegistry.withHeadCache(headCache);
    const firstNetwork = createStores();

    await headCache.save('network-1', 'identity:identity-1', {
      cid: 'bafyidentity',
      handle: 'hasko',
      identityId: 'identity-1',
      networkIds: ['network-1'],
      receivedAt: 1,
      version: 1,
    });
    await headCache.markWarm('network-1');
    firstNetwork.heads.all.mockResolvedValue([]);

    await registry.register('network-1', firstNetwork.stores);

    expect(registry.findCachedHead('identity-handle:hasko')).toEqual({
      cid: 'bafyidentity',
      handle: 'hasko',
      identityId: 'identity-1',
      networkIds: ['network-1'],
      receivedAt: 1,
      version: 1,
    });
  });

  it('waits for OrbitDB heads when the local cache is not marked warm', async () => {
    const headCache = new InMemoryOrbitDBReplicatedHeadCache();
    const registry = OrbitDBReplicatedStateRegistry.withHeadCache(headCache);
    const firstNetwork = createStores();
    let headScanResolved = false;

    await headCache.save('network-1', 'community:community-1', {
      id: 'community-1',
      networkId: 'network-1',
      updatedAt: 1,
    });
    firstNetwork.heads.all.mockImplementation(async () => {
      headScanResolved = true;

      return [
        {
          key: 'community:community-2',
          value: {
            id: 'community-2',
            networkId: 'network-1',
            updatedAt: 1,
          },
        },
      ];
    });

    await registry.register('network-1', firstNetwork.stores);

    expect(headScanResolved).toBe(true);
    expect(registry.findCachedHeadsByPrefix('community:')).toEqual([
      {
        id: 'community-1',
        networkId: 'network-1',
        updatedAt: 1,
      },
      {
        id: 'community-2',
        networkId: 'network-1',
        updatedAt: 1,
      },
    ]);
  });

  it('persists written heads in the local cache for the next startup', async () => {
    const headCache = new InMemoryOrbitDBReplicatedHeadCache();
    const registry = OrbitDBReplicatedStateRegistry.withHeadCache(headCache);
    const firstNetwork = createStores();

    await registry.register('network-1', firstNetwork.stores);
    await registry.putHead(
      'identity:identity-1',
      {
        id: 'identity-1',
        networkId: 'network-1',
        updatedAt: 1,
      },
      ['network-1'],
    );

    await expect(headCache.findByNetworkId('network-1')).resolves.toEqual([
      {
        key: 'identity:identity-1',
        value: {
          id: 'identity-1',
          networkId: 'network-1',
          updatedAt: 1,
        },
      },
    ]);
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
      expect.stringContaining('OrbitDB queryDocuments slow: store=communities'),
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
