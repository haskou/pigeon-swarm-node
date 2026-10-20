import { Identity } from '@app/contexts/identities/domain/Identity';
import { IdentityPrimitives } from '@app/contexts/identities/domain/IdentityPrimitives';
import IpfsIdentityMapper from '@app/contexts/identities/infrastructure/ipfs/mappers/IpfsIdentityMapper';
import { OrbitDBIdentityMutationGate } from '@app/contexts/identities/infrastructure/orbitdb/OrbitDBIdentityMutationGate';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';
import { OrbitDBEntry } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBEntry';
import { OrbitDBMutationGate } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBMutationGate';
import { OrbitDBPrivateNetworkStores } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBPrivateNetworkStores';
import OrbitDBReplicatedHeadCache, {
  OrbitDBReplicatedHeadCacheEntry,
} from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedHeadCache';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import ReplicatedStateNotReadyError from '@app/contexts/shared/infrastructure/orbitdb/ReplicatedStateNotReadyError';
import { mock, MockProxy } from 'jest-mock-extended';
import { createHash } from 'node:crypto';

import { IdentityIdMother } from '../../../../mothers/IdentityIdMother';
import { SignedIdentityMother } from '../../../../mothers/SignedIdentityMother';

type Entry = {
  key?: string;
  value: Record<string, unknown>;
};

class InMemoryOrbitDBReplicatedHeadCache extends OrbitDBReplicatedHeadCache {
  private readonly entries: Array<
    OrbitDBReplicatedHeadCacheEntry & { networkId: string }
  > = [];

  private readonly reconciledHeadSignatures = new Map<string, string>();
  private readonly warmNetworkIds = new Set<string>();

  public async deleteByNetworkId(networkId: string): Promise<void> {
    for (let index = this.entries.length - 1; index >= 0; index -= 1) {
      if (this.entries[index].networkId === networkId) {
        this.entries.splice(index, 1);
      }
    }
  }

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

  public async findReconciledHeadSignature(
    networkId: string,
  ): Promise<string | undefined> {
    return this.reconciledHeadSignatures.get(networkId);
  }

  public async markWarm(
    networkId: string,
    reconciledHeadSignature?: string,
  ): Promise<void> {
    this.warmNetworkIds.add(networkId);

    if (reconciledHeadSignature) {
      this.reconciledHeadSignatures.set(networkId, reconciledHeadSignature);
    }
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
  emitJoin(peerId: string, heads: OrbitDBEntry[]): void;
  emitUpdate(entry: { payload?: { key?: string; value?: unknown } }): void;
  events: {
    on: jest.Mock<
      void,
      [
        'join' | 'update',
        (
          entryOrPeerId:
            string | { payload?: { key?: string; value?: unknown } },
          heads?: OrbitDBEntry[],
        ) => void,
      ]
    >;
  };
  get: jest.Mock<Promise<Record<string, unknown> | undefined>, [string]>;
  log?: {
    get?: (hash: string) => Promise<OrbitDBEntry | undefined>;
    heads: jest.Mock<Promise<OrbitDBEntry[]>>;
  };
  put: jest.Mock<Promise<string>, [string | Record<string, unknown>, unknown?]>;
  query: jest.Mock<
    Promise<Record<string, unknown>[]>,
    [(document: Record<string, unknown>) => boolean]
  >;
};

function createStore(): Store {
  const entries: Entry[] = [];
  const joinHandlers: Array<(peerId: string, heads?: OrbitDBEntry[]) => void> =
    [];
  const updateHandlers: Array<
    (entry: { payload?: { key?: string; value?: unknown } }) => void
  > = [];

  return {
    all: jest.fn(async () => entries),
    emitJoin(peerId, heads): void {
      joinHandlers.forEach((handler) => handler(peerId, heads));
    },
    emitUpdate(entry): void {
      updateHandlers.forEach((handler) => handler(entry));
    },
    events: {
      on: jest.fn((event, handler) => {
        if (event === 'join') {
          joinHandlers.push(handler);

          return;
        }

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
  calls: Store;
  communityOperations: Store;
  contentReplication: Store;
  identities: Store;
  keychains: Store;
  heads: Store;
  messages: Store;
  notifications: Store;
  stores: OrbitDBPrivateNetworkStores;
} {
  const calls = createStore();
  const communityOperations = createStore();
  const contentReplication = createStore();
  const identities = createStore();
  const keychains = createStore();
  const messages = createStore();
  const notifications = createStore();
  const heads = createStore();
  const databases = {
    calls,
    communityOperations,
    contentReplication,
    conversationOperations: createStore(),
    heads,
    identities,
    keychains,
    messages,
    notifications,
    reactions: createStore(),
    requests: createStore(),
  };
  const storeSet = {
    ...databases,
    getSynchronizationStores: () =>
      Object.entries(databases).map(([name, database]) => ({
        database,
        name,
        getSynchronizedPeerIds: (): string[] => [],
      })),
    stop: async (): Promise<void> => undefined,
  };

  return {
    calls,
    communityOperations,
    contentReplication,
    heads,
    identities,
    keychains,
    messages,
    notifications,
    stores: storeSet as unknown as OrbitDBPrivateNetworkStores,
  };
}

describe('OrbitDBReplicatedStateRegistry', () => {
  it('honors a registered merge decision even when its timestamp is older', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const { stores } = createStores();
    registry.registerHeadRecordMerger('community:', (current, candidate) =>
      current?.versioned ? current : candidate,
    );
    await registry.register('network-1', stores);
    const key = 'community:migration';
    registry.cacheHeadLocally(key, { updatedAt: 10000 });
    registry.cacheHeadLocally(key, { updatedAt: 1, versioned: true });
    expect(registry.findCachedHead(key)).toEqual({
      updatedAt: 1,
      versioned: true,
    });
    registry.clear();
  });

  it('does not expose a persisted head rejected by its registered merger', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const { heads, stores } = createStores();
    registry.registerHeadRecordMerger('community:', () => undefined);
    await registry.register('network-1', stores);
    heads.get.mockResolvedValue({ invalid: true });
    await expect(
      registry.findPersistedHead('community:invalid'),
    ).resolves.toBeUndefined();
    registry.clear();
  });

  it('removes cached heads rejected by a scope registered after hydration', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const { heads, stores } = createStores();
    const key = 'device-authorization:identity';
    const document = { id: key, revision: 1 };

    heads.all.mockResolvedValue([{ key, value: document }]);
    await registry.register('public-network', stores);
    await expect(registry.findHead(key)).resolves.toEqual(document);

    registry.registerHeadRecordMerger(
      'device-authorization:',
      (_current, candidate) => candidate,
      (networkId, candidate) =>
        networkId === 'private-network' ? candidate : undefined,
    );

    await expect(registry.findHead(key)).resolves.toBeUndefined();
    registry.clear();
  });

  it('reconstructs mergeable heads from concurrent ancestors hidden by the keyvalue index', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const { heads, stores } = createStores();
    const key = 'community:history';
    const first = { members: ['owner', 'alice'] };
    const second = { members: ['owner', 'bob'] };
    const ancestor: OrbitDBEntry = {
      hash: 'first',
      next: [],
      payload: { key, value: first },
    };
    const latest: OrbitDBEntry = {
      hash: 'second',
      next: ['first'],
      payload: { key, value: second },
    };
    heads.all.mockResolvedValue([{ key, value: second }]);
    heads.log = {
      get: async (hash) => (hash === 'first' ? ancestor : undefined),
      heads: jest.fn(async () => [latest]),
    };
    registry.registerHeadRecordMerger('community:', (current, candidate) => ({
      members: [
        ...new Set([
          ...((current?.members as string[]) ?? []),
          ...(candidate.members as string[]),
        ]),
      ].sort(),
    }));

    await registry.register('network-1', stores);

    await expect(registry.findHead(key)).resolves.toEqual({
      members: ['alice', 'bob', 'owner'],
    });
    registry.clear();
  });

  it('merges the persisted history of a head its merger refused while it could not judge it', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const { heads, stores } = createStores();
    const key = 'device-authorization:history';
    const first = { members: ['owner', 'alice'] };
    const second = { members: ['owner', 'bob'] };
    const ancestor: OrbitDBEntry = {
      hash: 'first',
      next: [],
      payload: { key, value: first },
    };
    const latest: OrbitDBEntry = {
      hash: 'second',
      next: ['first'],
      payload: { key: 'unrelated', value: { members: ['mallory'] } },
    };
    const head: OrbitDBEntry = {
      hash: 'third',
      next: ['second'],
      payload: { key, value: second },
    };
    let judged = false;
    heads.all.mockResolvedValue([{ key, value: second }]);
    heads.get.mockResolvedValue(second);
    heads.log = {
      get: async (hash) =>
        ({ first: ancestor, second: latest })[hash as 'first' | 'second'],
      heads: jest.fn(async () => [head]),
    };
    registry.registerHeadRecordMerger(
      'device-authorization:',
      (current, candidate) =>
        judged
          ? {
              members: [
                ...new Set([
                  ...((current?.members as string[]) ?? []),
                  ...(candidate.members as string[]),
                ]),
              ].sort(),
            }
          : current,
    );
    await registry.register('network-1', stores);

    await expect(registry.findHead(key)).resolves.toBeUndefined();

    judged = true;
    await registry.rehydrateHead(key);

    await expect(registry.findHead(key)).resolves.toEqual({
      members: ['alice', 'bob', 'owner'],
    });
    registry.clear();
  });

  it('replays call history for each new subscriber without resetting existing subscribers', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const { calls, stores } = createStores();
    const ancestor: OrbitDBEntry = {
      hash: 'first',
      next: [],
      payload: { value: { id: 'call', updatedAt: 1 } },
    };
    const head: OrbitDBEntry = {
      hash: 'second',
      next: ['first'],
      payload: { value: { id: 'call', updatedAt: 2 } },
    };
    calls.log = {
      get: async () => ancestor,
      heads: jest.fn(async () => [head]),
    };
    await registry.register('network-1', stores);
    const first: unknown[] = [];
    const second: unknown[] = [];

    await registry.onDocumentUpdated(
      'calls',
      (document) => {
        first.push(document.updatedAt);
      },
      { includeHistory: true },
    );
    await registry.onDocumentUpdated(
      'calls',
      (document) => {
        second.push(document.updatedAt);
      },
      { includeHistory: true },
    );

    expect(first).toEqual([1, 2]);
    expect(second).toEqual([1, 2]);
    registry.clear();
  });

  it('retries a history subscriber on the next store update after its replay could not load a block in time', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const { calls, stores } = createStores();
    const ancestor: OrbitDBEntry = {
      hash: 'first',
      next: [],
      payload: { value: { id: 'call', updatedAt: 1 } },
    };
    const head: OrbitDBEntry = {
      hash: 'second',
      next: ['first'],
      payload: { value: { id: 'call', updatedAt: 2 } },
    };
    const getAncestor = jest.fn(() => Promise.resolve(ancestor));
    calls.log = {
      get: getAncestor,
      heads: jest.fn(() => Promise.resolve([head])),
    };
    await registry.register('network-1', stores);
    await registry.onDocumentUpdated('calls', () => undefined, {
      includeHistory: true,
    });
    const late: unknown[] = [];

    getAncestor.mockRejectedValueOnce(
      new DOMException(
        'The operation was aborted due to timeout',
        'TimeoutError',
      ),
    );
    await registry.onDocumentUpdated(
      'calls',
      (document) => {
        late.push(document.updatedAt);
      },
      { includeHistory: true },
    );
    const beforeRetry = [...late];

    calls.emitUpdate({ payload: { value: head.payload?.value } });
    await flushPromises();

    expect(beforeRetry).toEqual([]);
    expect(late).toEqual([1, 2]);
    registry.clear();
  });

  it('reports a store as deferred until every deferred subscriber replays its history', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const { calls, stores } = createStores();
    const missingBlock = new DOMException(
      'The operation was aborted due to timeout',
      'TimeoutError',
    );

    await registry.register('network-1', stores);
    calls.all
      .mockRejectedValueOnce(missingBlock)
      .mockRejectedValueOnce(missingBlock);
    await registry.onDocumentUpdated('calls', () => undefined, {
      includeHistory: true,
    });
    const deferred = registry.isSubscriberBootstrapDeferred('calls');

    calls.emitUpdate({ payload: { value: { id: 'call', updatedAt: 1 } } });
    await flushPromises();
    const stillDeferred = registry.isSubscriberBootstrapDeferred('calls');

    calls.emitUpdate({ payload: { value: { id: 'call', updatedAt: 2 } } });
    await flushPromises();

    expect(deferred).toBe(true);
    expect(stillDeferred).toBe(true);
    expect(registry.isSubscriberBootstrapDeferred('calls')).toBe(false);
    expect(registry.isSubscriberBootstrapDeferred('messages')).toBe(false);
    registry.clear();
  });

  it('is open once a network is registered and no subscriber replay is deferred', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const { calls, stores } = createStores();
    const missingBlock = new DOMException(
      'The operation was aborted due to timeout',
      'TimeoutError',
    );

    expect(registry.isOpen()).toBe(false);

    await registry.register('network-1', stores);
    expect(registry.isOpen()).toBe(true);

    calls.all
      .mockRejectedValueOnce(missingBlock)
      .mockRejectedValueOnce(missingBlock);
    await registry.onDocumentUpdated('calls', () => undefined, {
      includeHistory: true,
    });
    expect(registry.isOpen()).toBe(false);

    calls.emitUpdate({ payload: { value: { id: 'call', updatedAt: 1 } } });
    await flushPromises();
    expect(registry.isOpen()).toBe(false);

    calls.emitUpdate({ payload: { value: { id: 'call', updatedAt: 2 } } });
    await flushPromises();
    expect(registry.isOpen()).toBe(true);
    registry.clear();
  });

  it('reports whether any network is registered', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const { stores } = createStores();

    expect(registry.hasNetworks()).toBe(false);

    await registry.register('network-1', stores);
    expect(registry.hasNetworks()).toBe(true);

    await registry.unregister('network-1');
    expect(registry.hasNetworks()).toBe(false);
    registry.clear();
  });

  it('is not open while a registration still replays its subscriber history', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const first = createStores();
    const second = createStores();
    let releaseReplay = (): void => undefined;
    const replayGate = new Promise<void>((resolve) => {
      releaseReplay = () => resolve();
    });

    await registry.register('network-1', first.stores);
    await registry.onDocumentUpdated('calls', () => undefined, {
      includeHistory: true,
    });
    second.calls.all.mockImplementationOnce(async () => {
      await replayGate;

      return [];
    });

    const registration = registry.register('network-2', second.stores);
    await flushPromises();
    expect(registry.isOpen()).toBe(false);

    releaseReplay();
    await registration;
    expect(registry.isOpen()).toBe(true);
    registry.clear();
  });

  it('stays not open after a degraded registration until a peer join replays the store', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const { calls, stores } = createStores();
    const missingBlock = new DOMException(
      'The operation was aborted due to timeout',
      'TimeoutError',
    );

    await registry.onDocumentUpdated('calls', () => undefined, {
      includeHistory: true,
    });
    calls.all.mockRejectedValueOnce(missingBlock);

    await expect(registry.register('network-1', stores)).rejects.toThrow();
    expect(registry.isOpen()).toBe(false);

    calls.emitJoin('peer-1', []);
    await flushPromises();
    expect(registry.isOpen()).toBe(true);
    registry.clear();
  });

  it('stays not open after a restart whose head cache rebuild fails, with no listeners', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const { heads, stores } = createStores();
    const missingBlock = new DOMException(
      'The operation was aborted due to timeout',
      'TimeoutError',
    );

    heads.all.mockRejectedValueOnce(missingBlock);

    await expect(registry.register('network-1', stores)).rejects.toThrow();
    expect(registry.hasNetworks()).toBe(true);
    expect(registry.isOpen()).toBe(false);

    heads.emitJoin('peer-1', []);
    await flushPromises();
    expect(registry.isOpen()).toBe(true);
    registry.clear();
  });

  it('stops waiting on a degraded network once it is unregistered', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const degraded = createStores();
    const healthy = createStores();
    const missingBlock = new DOMException(
      'The operation was aborted due to timeout',
      'TimeoutError',
    );

    await registry.onDocumentUpdated('calls', () => undefined, {
      includeHistory: true,
    });
    degraded.calls.all.mockRejectedValueOnce(missingBlock);

    await expect(
      registry.register('network-1', degraded.stores),
    ).rejects.toThrow();
    await registry.register('network-2', healthy.stores);
    expect(registry.isOpen()).toBe(false);

    await registry.unregister('network-1');
    expect(registry.isOpen()).toBe(true);
    registry.clear();
  });

  it('keeps the node not ready while a deferred subscriber replay is outstanding, however long it waits', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const { calls, stores } = createStores();
    const missingBlock = new DOMException(
      'The operation was aborted due to timeout',
      'TimeoutError',
    );
    const deferredAt = 1_000_000;
    const now = jest.spyOn(Date, 'now').mockReturnValue(deferredAt);

    await registry.register('network-1', stores);
    calls.all
      .mockRejectedValueOnce(missingBlock)
      .mockRejectedValueOnce(missingBlock);
    await registry.onDocumentUpdated('calls', () => undefined, {
      includeHistory: true,
    });
    expect(registry.isOpen()).toBe(false);

    now.mockReturnValue(
      deferredAt +
        OrbitDBReplicatedStateRegistry.DEFERRED_BOOTSTRAP_NOT_READY_MS,
    );
    expect(registry.isSubscriberBootstrapDeferred('calls')).toBe(false);
    expect(registry.isOpen()).toBe(false);

    now.mockRestore();
    registry.clear();
  });

  it('fails a subscription whose bootstrap fails for a non-transient reason', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const { calls, stores } = createStores();
    const failure = new Error('replicated call projection rejected');

    await registry.register('network-1', stores);
    calls.all.mockRejectedValueOnce(failure);

    await expect(
      registry.onDocumentUpdated('calls', () => undefined),
    ).rejects.toBe(failure);
    registry.clear();
  });

  it('subscribes to replicated head updates once when the same stores register again', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const { heads, stores } = createStores();

    await registry.register('network-1', stores);
    await registry.register('network-1', stores);

    expect(
      heads.events.on.mock.calls.filter(([event]) => event === 'update'),
    ).toHaveLength(1);
    expect(
      heads.events.on.mock.calls.filter(([event]) => event === 'join'),
    ).toHaveLength(1);
    registry.clear();
  });

  it('waits for asynchronous call history projection before completing subscription', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const { calls, stores } = createStores();
    calls.log = {
      get: async () => undefined,
      heads: jest.fn(async (): Promise<OrbitDBEntry[]> => [
        { hash: 'first', next: [], payload: { value: { id: 'call' } } },
      ]),
    };
    await registry.register('network-1', stores);
    const entered = deferred<void>();
    const release = deferred<void>();
    let ready = false;
    const subscription = registry
      .onDocumentUpdated(
        'calls',
        async () => {
          entered.resolve();
          await release.promise;
        },
        { includeHistory: true },
      )
      .then(() => {
        ready = true;
      });

    await entered.promise;
    await flushPromises();
    const completedBeforeProjection = ready;
    release.resolve();
    await subscription;

    expect(completedBeforeProjection).toBe(false);
    expect(ready).toBe(true);
    registry.clear();
  });

  it('throws when replicated state is not ready yet', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();

    await expect(
      registry.putDocument('communityOperations', { id: 'community-1' }),
    ).rejects.toMatchObject({
      code: 503020,
      httpCode: 503,
    });
  });

  it('tells which networks it replicates state for', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();

    await registry.register('network-1', createStores().stores);

    expect(registry.hostsNetwork('network-1')).toBe(true);
    expect(registry.hostsNetwork('network-2')).toBe(false);
  });

  it('routes documents to the matching network only', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const firstNetwork = createStores();
    const secondNetwork = createStores();

    await registry.register('network-1', firstNetwork.stores);
    await registry.register('network-2', secondNetwork.stores);

    await registry.putDocument('communityOperations', {
      id: 'community-1',
      networkId: 'network-1',
    });
    await registry.putHead(
      'community-operation-index:community-1',
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

    expect(firstNetwork.communityOperations.put).toHaveBeenCalledTimes(1);
    expect(secondNetwork.communityOperations.put).not.toHaveBeenCalled();
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
    firstNetwork.communityOperations.put.mockImplementationOnce(
      async () => delayedWrite.promise,
    );

    const write = registry.putDocument('communityOperations', {
      id: 'community-1',
    });

    await flushPromises();

    expect(firstNetwork.communityOperations.put).toHaveBeenCalledTimes(1);
    expect(secondNetwork.communityOperations.put).toHaveBeenCalledTimes(1);

    delayedWrite.resolve('ok');
    await write;
  });

  it('replicates documents in background without waiting for persistence', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const firstNetwork = createStores();
    const delayedWrite = deferred<string>();

    await registry.register('network-1', firstNetwork.stores);
    firstNetwork.communityOperations.put.mockImplementationOnce(
      async () => delayedWrite.promise,
    );

    const result = await Promise.race([
      registry
        .replicateDocumentInBackground('communityOperations', {
          id: 'community-1',
          networkId: 'network-1',
        })
        .then(() => 'written'),
      new Promise((resolve) => setTimeout(() => resolve('blocked'), 10)),
    ]);

    expect(result).toBe('written');
    expect(firstNetwork.communityOperations.put).toHaveBeenCalledWith({
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

  it('retries an unchanged index head when the previous replicated write failed', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const network = createStores();
    const head = {
      id: 'messages:conversation-1',
      messages: [
        {
          id: 'message-1',
          receivedAt: 1,
        },
      ],
      updatedAt: 1,
    };

    await registry.register('network-1', network.stores);
    network.heads.put.mockRejectedValueOnce(new Error('temporary failure'));

    await expect(
      registry.putHead('messages:conversation-1', head),
    ).rejects.toThrow('temporary failure');

    await registry.putHead('messages:conversation-1', {
      ...head,
      updatedAt: 2,
    });

    expect(network.heads.put).toHaveBeenCalledTimes(2);
    await expect(network.heads.get('messages:conversation-1')).resolves.toEqual(
      {
        ...head,
        updatedAt: 2,
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

    registry.cacheHeadLocally('presence:identity-1', {
      id: 'identity-1',
      identityId: 'identity-1',
      networkIds: ['network-1'],
      status: 'available',
      updatedAt: 1780000000000,
    });

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

  it('keeps a local projection ahead of older replicated content', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const network = createStores();

    await registry.register('network-1', network.stores);
    await registry.putHead(
      'sticker-user-library:identity-1',
      {
        id: 'identity-1',
        identityId: 'identity-1',
        savedPackIds: ['pack-1'],
      },
      ['network-1'],
    );

    registry.cacheHeadLocally('sticker-user-library:identity-1', {
      id: 'identity-1',
      identityId: 'identity-1',
      savedPackIds: ['pack-1', 'pack-2'],
    });

    await expect(
      registry.findHead('sticker-user-library:identity-1'),
    ).resolves.toEqual(
      expect.objectContaining({ savedPackIds: ['pack-1', 'pack-2'] }),
    );
  });

  it('serializes background writes for the same head', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const network = createStores();
    const firstWrite = deferred<string>();

    await registry.register('network-1', network.stores);
    network.heads.put.mockImplementationOnce(async () => firstWrite.promise);

    registry.replicateHeadInBackground(
      'sticker-user-library:identity-1',
      {
        id: 'identity-1',
        identityId: 'identity-1',
        savedPackIds: ['pack-1'],
      },
      ['network-1'],
    );
    registry.replicateHeadInBackground(
      'sticker-user-library:identity-1',
      {
        id: 'identity-1',
        identityId: 'identity-1',
        savedPackIds: ['pack-1', 'pack-2'],
      },
      ['network-1'],
    );
    await flushPromises();

    expect(network.heads.put).toHaveBeenCalledTimes(1);

    firstWrite.resolve('ok');
    await flushPromises();
    await flushPromises();

    expect(network.heads.put).toHaveBeenCalledTimes(2);
    await expect(
      registry.findHead('sticker-user-library:identity-1'),
    ).resolves.toEqual(
      expect.objectContaining({ savedPackIds: ['pack-1', 'pack-2'] }),
    );
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

    await registry.register('network-1', firstNetwork.stores);
    await registry.register('network-2', secondNetwork.stores);

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
      'community-operation-index:community-1',
      {
        id: 'community-1',
        networkId: 'network-2',
      },
      ['network-2'],
    );
    firstNetwork.communityOperations.query.mockClear();
    secondNetwork.communityOperations.query.mockClear();

    await registry.putDocument('messages', {
      communityId: 'community-1',
      id: 'message-1',
      scopeType: 'community_channel',
    });

    expect(firstNetwork.messages.put).not.toHaveBeenCalled();
    expect(secondNetwork.messages.put).toHaveBeenCalledTimes(1);
    expect(firstNetwork.communityOperations.query).not.toHaveBeenCalled();
    expect(secondNetwork.communityOperations.query).not.toHaveBeenCalled();
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

    expect(firstNetwork.communityOperations.put).not.toHaveBeenCalled();
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

    await registry.register('network-1', firstNetwork.stores);
    firstNetwork.heads.emitUpdate({
      payload: {
        key: 'conversation:conversation-1',
        value: {
          id: 'conversation:conversation-1',
          networkId: 'network-1',
          updatedAt: 1,
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

  it('caches canonical keychain heads from OrbitDB update payloads', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const firstNetwork = createStores();

    await registry.register('network-1', firstNetwork.stores);
    firstNetwork.heads.emitUpdate({
      payload: {
        key: 'keychain:identity-1',
        value: {
          cid: 'keychain-v2',
          ownerIdentityId: 'identity-1',
          receivedAt: 200,
          version: 2,
        },
      },
    });

    await expect(registry.findHead('keychain:identity-1')).resolves.toEqual(
      expect.objectContaining({
        cid: 'keychain-v2',
        version: 2,
      }),
    );
  });

  it('never caches or serves a replicated head the mutation gate rejects', async () => {
    const gate = mock<OrbitDBMutationGate>();
    const registry = new OrbitDBReplicatedStateRegistry();
    const firstNetwork = createStores();

    gate.governs.mockReturnValue(false);
    gate.governsHead.mockImplementation((key) => key.startsWith('keychain:'));
    gate.acceptsHead.mockImplementation((_key, record) =>
      Promise.resolve(record.cid !== 'forged'),
    );
    registry.addMutationGate(gate);
    await registry.register('network-1', firstNetwork.stores);
    firstNetwork.heads.emitUpdate({
      payload: {
        key: 'keychain:identity-1',
        value: {
          cid: 'forged',
          ownerIdentityId: 'identity-1',
          receivedAt: 200,
          version: 99,
        },
      },
    });
    firstNetwork.heads.emitUpdate({
      payload: {
        key: 'keychain:identity-2',
        value: {
          cid: 'signed',
          ownerIdentityId: 'identity-2',
          receivedAt: 200,
          version: 1,
        },
      },
    });
    await flushPromises();

    await expect(
      registry.findHead('keychain:identity-1'),
    ).resolves.toBeUndefined();
    await expect(registry.findHead('keychain:identity-2')).resolves.toEqual(
      expect.objectContaining({ cid: 'signed' }),
    );
  });

  it.each(IdentityIdMother.aliases())(
    'never restores at startup a persisted identity signed under %s of its key',
    async (_, aliasOf) => {
      const ipfs = mock<IPFS>();
      const mapper = new IpfsIdentityMapper();
      const headCache = new InMemoryOrbitDBReplicatedHeadCache();
      const registry = OrbitDBReplicatedStateRegistry.withHeadCache(headCache);
      const { heads, stores } = createStores();
      const signer = await SignedIdentityMother.create();
      const aliasId = aliasOf(new IdentityId(signer.id)).valueOf();
      const recordOf = async (
        identity: Identity | IdentityPrimitives,
      ): Promise<Record<string, unknown>> => {
        const primitives =
          identity instanceof Identity ? identity.toPrimitives() : identity;
        const cid =
          identity instanceof Identity
            ? (
                await ipfs.calculateJSONId(mapper.toDocument(identity))
              ).valueOf()
            : 'bafy-unconstructible';

        return {
          cid,
          id: cid,
          identity: primitives,
          identityId: primitives.id,
          networkIds: primitives.networks,
          version: primitives.version,
        };
      };

      ipfs.calculateJSONId.mockImplementation((data) =>
        Promise.resolve(
          new IPFSId(
            `bafy${createHash('sha256').update(JSON.stringify(data)).digest('hex')}`,
          ),
        ),
      );
      await headCache.save(
        'network-1',
        `identity:${aliasId}`,
        await recordOf(signer.primitives({ id: aliasId })),
      );
      await headCache.save(
        'network-1',
        `identity:${signer.id}`,
        await recordOf(signer.build()),
      );
      await headCache.markWarm('network-1', JSON.stringify(['head-1']));
      heads.log = {
        heads: jest.fn(async () => [{ hash: 'head-1' }]),
      };
      registry.addMutationGate(new OrbitDBIdentityMutationGate(ipfs));
      await registry.register('network-1', stores);

      await expect(
        registry.findHead(`identity:${aliasId}`),
      ).resolves.toBeUndefined();
      await expect(registry.findHead(`identity:${signer.id}`)).resolves.toEqual(
        expect.objectContaining({ identityId: signer.id }),
      );
      registry.clear();
    },
  );

  it('re-admits a head whose record claims an authorization revision the node has not replicated yet', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });

    try {
      const gate = mock<OrbitDBMutationGate>();
      const registry = new OrbitDBReplicatedStateRegistry();
      const firstNetwork = createStores();
      let authorizationHeadReplicated = false;

      gate.governs.mockImplementation(
        (collection) => collection === 'communityOperations',
      );
      gate.governsHead.mockReturnValue(false);
      gate.verdictOf.mockImplementation(() =>
        Promise.resolve(authorizationHeadReplicated ? 'accepted' : 'pending'),
      );
      registry.addMutationGate(gate);
      await registry.register('network-1', firstNetwork.stores);
      firstNetwork.heads.emitUpdate({
        payload: {
          key: 'community:community-1',
          value: {
            communityOperations: [{ id: 'operation-1' }],
            id: 'community-1',
            updatedAt: 10,
          },
        },
      });
      await jest.advanceTimersByTimeAsync(0);

      await expect(
        registry.findHead('community:community-1'),
      ).rejects.toThrow(ReplicatedStateNotReadyError);

      authorizationHeadReplicated = true;
      await jest.advanceTimersByTimeAsync(2_000);

      await expect(registry.findHead('community:community-1')).resolves.toEqual(
        expect.objectContaining({
          communityOperations: [{ id: 'operation-1' }],
        }),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('admits a degraded head as soon as the identity its record rests on replicates', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });

    try {
      const gate = mock<OrbitDBMutationGate>();
      const registry = new OrbitDBReplicatedStateRegistry();
      const firstNetwork = createStores();

      gate.governs.mockImplementation(
        (collection) => collection === 'communityOperations',
      );
      gate.governsHead.mockReturnValue(false);
      gate.verdictOf.mockImplementation(() =>
        Promise.resolve(
          registry.findCachedHead('identity:joiner') !== undefined
            ? 'accepted'
            : 'pending',
        ),
      );
      registry.addMutationGate(gate);
      await registry.register('network-1', firstNetwork.stores);
      firstNetwork.heads.emitUpdate({
        payload: {
          key: 'community:community-1',
          value: {
            communityOperations: [{ id: 'join-1' }],
            id: 'community-1',
            updatedAt: 10,
          },
        },
      });
      await jest.advanceTimersByTimeAsync(2_000 + 10_000);

      await expect(
        registry.findHead('community:community-1'),
      ).rejects.toThrow(ReplicatedStateNotReadyError);

      firstNetwork.heads.emitUpdate({
        payload: {
          key: 'identity:joiner',
          value: { identityId: 'joiner', updatedAt: 20 },
        },
      });
      await jest.advanceTimersByTimeAsync(5_000);

      await expect(registry.findHead('community:community-1')).resolves.toEqual(
        expect.objectContaining({
          communityOperations: [{ id: 'join-1' }],
        }),
      );
      registry.clear();
    } finally {
      jest.useRealTimers();
    }
  });

  it('reports a degraded community head as pending until it is admitted', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });

    try {
      const gate = mock<OrbitDBMutationGate>();
      const registry = new OrbitDBReplicatedStateRegistry();
      const firstNetwork = createStores();

      gate.governs.mockImplementation(
        (collection) => collection === 'communityOperations',
      );
      gate.governsHead.mockReturnValue(false);
      gate.verdictOf.mockImplementation(() =>
        Promise.resolve(
          registry.findCachedHead('identity:joiner') !== undefined
            ? 'accepted'
            : 'pending',
        ),
      );
      registry.addMutationGate(gate);
      await registry.register('network-1', firstNetwork.stores);
      firstNetwork.heads.emitUpdate({
        payload: {
          key: 'community-operation-index:community-1',
          value: {
            communityOperations: [{ id: 'join-1' }],
            id: 'community-1',
            updatedAt: 10,
          },
        },
      });
      await jest.advanceTimersByTimeAsync(1);

      expect(
        registry.hasPendingHeadAdmissions('community-operation-index:'),
      ).toBe(true);
      expect(registry.hasPendingHeadAdmissions('community-mls-index:')).toBe(
        false,
      );

      firstNetwork.heads.emitUpdate({
        payload: {
          key: 'identity:joiner',
          value: { identityId: 'joiner', updatedAt: 20 },
        },
      });
      await jest.advanceTimersByTimeAsync(5_000);

      expect(
        registry.hasPendingHeadAdmissions('community-operation-index:'),
      ).toBe(false);
      registry.clear();
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps a degraded head pending when another degraded value arrives under its key', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });

    try {
      const gate = mock<OrbitDBMutationGate>();
      const headCache = new InMemoryOrbitDBReplicatedHeadCache();
      const registry = OrbitDBReplicatedStateRegistry.withHeadCache(headCache);
      const firstNetwork = createStores();

      gate.governs.mockImplementation(
        (collection) => collection === 'communityOperations',
      );
      gate.governsHead.mockReturnValue(false);
      gate.verdictOf.mockImplementation((_collection, record) =>
        Promise.resolve(
          record.id === 'join-1' &&
            registry.findCachedHead('identity:joiner') !== undefined
            ? 'accepted'
            : 'pending',
        ),
      );
      registry.addMutationGate(gate);
      await registry.register('network-1', firstNetwork.stores);
      firstNetwork.heads.emitUpdate({
        payload: {
          key: 'community:community-1',
          value: {
            communityOperations: [{ id: 'join-1' }],
            id: 'community-1',
            updatedAt: 10,
          },
        },
      });
      await jest.advanceTimersByTimeAsync(1_000);
      firstNetwork.heads.emitUpdate({
        payload: {
          key: 'community:community-1',
          value: {
            communityOperations: [{ id: 'forged-1' }],
            id: 'community-1',
            updatedAt: 11,
          },
        },
      });
      await jest.advanceTimersByTimeAsync(2_000 + 10_000);
      firstNetwork.heads.emitUpdate({
        payload: {
          key: 'identity:joiner',
          value: { identityId: 'joiner', updatedAt: 20 },
        },
      });
      await jest.advanceTimersByTimeAsync(5_000);

      // The admitted join-1 record is delivered while forged-1 stays withheld,
      // so the key keeps answering 503020.
      await expect(
        headCache.findByNetworkId('network-1'),
      ).resolves.toContainEqual({
        key: 'community:community-1',
        value: expect.objectContaining({
          communityOperations: [{ id: 'join-1' }],
        }),
      });
      await expect(
        registry.findHead('community:community-1'),
      ).rejects.toThrow(ReplicatedStateNotReadyError);
      registry.clear();
    } finally {
      jest.useRealTimers();
    }
  });

  it('demotes and delivers a head whose refused record can never become valid', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });

    try {
      const gate = mock<OrbitDBMutationGate>();
      const registry = new OrbitDBReplicatedStateRegistry();
      const firstNetwork = createStores();

      gate.governs.mockImplementation(
        (collection) => collection === 'communityOperations',
      );
      gate.governsHead.mockReturnValue(false);
      gate.verdictOf.mockImplementation((_collection, record) =>
        Promise.resolve(record.id === 'forged-1' ? 'refused' : 'accepted'),
      );
      registry.addMutationGate(gate);
      await registry.register('network-1', firstNetwork.stores);
      firstNetwork.heads.emitUpdate({
        payload: {
          key: 'community-operation-index:community-1',
          value: {
            communityOperations: [{ id: 'forged-1' }, { id: 'join-1' }],
            id: 'community-1',
            updatedAt: 10,
          },
        },
      });
      await jest.advanceTimersByTimeAsync(1);

      expect(
        registry.hasPendingHeadAdmissions('community-operation-index:'),
      ).toBe(false);
      await expect(
        registry.findHead('community-operation-index:community-1'),
      ).resolves.toEqual(
        expect.objectContaining({
          communityOperations: [{ id: 'join-1' }],
          updatedAt: 0,
        }),
      );
      registry.clear();
    } finally {
      jest.useRealTimers();
    }
  });

  it('delivers the admitted records of a head while its pending record is withheld', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });

    try {
      const gate = mock<OrbitDBMutationGate>();
      const headCache = new InMemoryOrbitDBReplicatedHeadCache();
      const registry = OrbitDBReplicatedStateRegistry.withHeadCache(headCache);
      const firstNetwork = createStores();
      let forgedProven = false;

      gate.governs.mockImplementation(
        (collection) => collection === 'communityOperations',
      );
      gate.governsHead.mockReturnValue(false);
      gate.verdictOf.mockImplementation((_collection, record) =>
        Promise.resolve(
          record.id === 'forged-1' && !forgedProven ? 'pending' : 'accepted',
        ),
      );
      registry.addMutationGate(gate);
      await registry.register('network-1', firstNetwork.stores);
      firstNetwork.heads.emitUpdate({
        payload: {
          key: 'community-operation-index:community-1',
          value: {
            communityOperations: [{ id: 'forged-1' }, { id: 'join-1' }],
            id: 'community-1',
            updatedAt: 10,
          },
        },
      });
      await jest.advanceTimersByTimeAsync(1);

      // The admitted record is delivered while the pending one is withheld.
      await expect(
        headCache.findByNetworkId('network-1'),
      ).resolves.toContainEqual({
        key: 'community-operation-index:community-1',
        value: expect.objectContaining({
          communityOperations: [{ id: 'join-1' }],
          updatedAt: 0,
        }),
      });
      expect(
        registry.hasPendingHeadAdmissions('community-operation-index:'),
      ).toBe(true);
      expect(
        registry.findCachedHead('community-operation-index:community-1'),
      ).toBeUndefined();
      await expect(
        registry.findHead('community-operation-index:community-1'),
      ).rejects.toThrow(ReplicatedStateNotReadyError);

      // Once the pending record proves out, the held head is delivered whole.
      forgedProven = true;
      await jest.advanceTimersByTimeAsync(120_000);

      expect(
        registry.hasPendingHeadAdmissions('community-operation-index:'),
      ).toBe(false);
      await expect(
        registry.findHead('community-operation-index:community-1'),
      ).resolves.toEqual(
        expect.objectContaining({
          communityOperations: expect.arrayContaining([
            { id: 'forged-1' },
            { id: 'join-1' },
          ]),
        }),
      );
      registry.clear();
    } finally {
      jest.useRealTimers();
    }
  });

  it('holds a head whose gate check fails unexpectedly rather than dropping it', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });

    try {
      const gate = mock<OrbitDBMutationGate>();
      const registry = new OrbitDBReplicatedStateRegistry();
      const firstNetwork = createStores();

      gate.governs.mockImplementation(
        (collection) => collection === 'communityOperations',
      );
      gate.governsHead.mockReturnValue(false);
      gate.verdictOf.mockRejectedValue(new Error('ipfs unavailable'));
      registry.addMutationGate(gate);
      await registry.register('network-1', firstNetwork.stores);
      firstNetwork.heads.emitUpdate({
        payload: {
          key: 'community-operation-index:community-1',
          value: {
            communityOperations: [{ id: 'join-1' }],
            id: 'community-1',
            updatedAt: 10,
          },
        },
      });
      await jest.advanceTimersByTimeAsync(1);

      expect(
        registry.hasPendingHeadAdmissions('community-operation-index:'),
      ).toBe(true);
      await expect(
        registry.findHead('community-operation-index:community-1'),
      ).rejects.toThrow(ReplicatedStateNotReadyError);
      registry.clear();
    } finally {
      jest.useRealTimers();
    }
  });

  it('holds a degraded head that is not plain JSON and offers it again', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });

    try {
      const gate = mock<OrbitDBMutationGate>();
      const registry = new OrbitDBReplicatedStateRegistry();
      const firstNetwork = createStores();
      let nested: Record<string, unknown> = {};

      for (let depth = 0; depth < 70; depth += 1) nested = { nested };
      gate.governs.mockImplementation(
        (collection) => collection === 'communityOperations',
      );
      gate.governsHead.mockReturnValue(false);
      gate.verdictOf.mockResolvedValue('pending');
      registry.addMutationGate(gate);
      await registry.register('network-1', firstNetwork.stores);
      firstNetwork.heads.emitUpdate({
        payload: {
          key: 'community:community-1',
          value: {
            communityOperations: [{ id: 'forged-1' }],
            id: 'community-1',
            nested,
            updatedAt: 10,
          },
        },
      });
      await jest.advanceTimersByTimeAsync(0);

      expect(registry.findCachedHead('community:community-1')).toBeUndefined();
      expect(registry.hasPendingHeadAdmissions('community:')).toBe(true);
      await expect(
        registry.findPersistedHead('community:community-1'),
      ).rejects.toThrow(ReplicatedStateNotReadyError);
      gate.verdictOf.mockClear();
      await jest.advanceTimersByTimeAsync(2_000 + 10_000);

      expect(gate.verdictOf).toHaveBeenCalled();
      registry.clear();
    } finally {
      jest.useRealTimers();
    }
  });

  it('releases a held head once a newer head under its key is admitted', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });

    try {
      const gate = mock<OrbitDBMutationGate>();
      const registry = new OrbitDBReplicatedStateRegistry();
      const firstNetwork = createStores();

      gate.governs.mockImplementation(
        (collection) => collection === 'communityOperations',
      );
      gate.governsHead.mockReturnValue(false);
      gate.verdictOf.mockResolvedValue('pending');
      registry.addMutationGate(gate);
      await registry.register('network-1', firstNetwork.stores);
      firstNetwork.heads.emitUpdate({
        payload: {
          key: 'community:community-1',
          value: {
            communityOperations: [{ id: 'forged-1' }],
            id: 'community-1',
            updatedAt: 10,
          },
        },
      });
      await jest.advanceTimersByTimeAsync(0);
      expect(registry.hasPendingHeadAdmissions('community:')).toBe(true);

      firstNetwork.heads.emitUpdate({
        payload: {
          key: 'community:community-1',
          value: { id: 'community-1', updatedAt: 12 },
        },
      });
      await jest.advanceTimersByTimeAsync(0);

      expect(registry.hasPendingHeadAdmissions('community:')).toBe(false);
      expect(registry.findCachedHead('community:community-1')).toEqual(
        expect.objectContaining({ id: 'community-1', updatedAt: 12 }),
      );
      registry.clear();
    } finally {
      jest.useRealTimers();
    }
  });

  it('offers a held head again on the retry interval once its backoff retires', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });

    try {
      const gate = mock<OrbitDBMutationGate>();
      const registry = new OrbitDBReplicatedStateRegistry();
      const firstNetwork = createStores();

      gate.governs.mockImplementation(
        (collection) => collection === 'communityOperations',
      );
      gate.governsHead.mockReturnValue(false);
      gate.verdictOf.mockResolvedValue('pending');
      registry.addMutationGate(gate);
      await registry.register('network-1', firstNetwork.stores);
      firstNetwork.heads.emitUpdate({
        payload: {
          key: 'community:community-1',
          value: {
            communityOperations: [{ id: 'forged-1' }],
            id: 'community-1',
            updatedAt: 10,
          },
        },
      });
      await jest.advanceTimersByTimeAsync(0);
      gate.verdictOf.mockClear();

      // The backoff offers at 2 s and 12 s. The retry interval at 60 s finds
      // the copy still pending and adds no offer of its own.
      await jest.advanceTimersByTimeAsync(60_000);

      expect(gate.verdictOf).toHaveBeenCalledTimes(2);

      // The backoff offers at 72 s, then retires the copy.
      await jest.advanceTimersByTimeAsync(12_000);
      const backoffOffers = gate.verdictOf.mock.calls.length;

      // The retry interval at 120 s offers it again after the backoff.
      await jest.advanceTimersByTimeAsync(60_000);

      expect(gate.verdictOf.mock.calls.length).toBeGreaterThan(backoffOffers);
      expect(registry.hasPendingHeadAdmissions('community:')).toBe(true);
      registry.clear();
    } finally {
      jest.useRealTimers();
    }
  });

  it('queues the held heads past the active bound and answers 503020 once the queue overflows, until the network drains and is rescanned', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });

    try {
      const gate = mock<OrbitDBMutationGate>();
      const registry = new OrbitDBReplicatedStateRegistry();
      const firstNetwork = createStores();
      let verdict: 'accepted' | 'pending' = 'pending';

      gate.governs.mockImplementation(
        (collection) => collection === 'communityOperations',
      );
      gate.governsHead.mockReturnValue(false);
      gate.verdictOf.mockImplementation(() => Promise.resolve(verdict));
      registry.addMutationGate(gate);
      await registry.register('network-1', firstNetwork.stores);

      // 256 active heads, 256 queued behind them, and one more than that.
      for (let index = 1; index <= 513; index += 1) {
        const value = {
          communityOperations: [{ id: `op-${index}` }],
          id: `c-${index}`,
          updatedAt: 10,
        };

        await firstNetwork.heads.put(`community:c-${index}`, value);
        firstNetwork.heads.emitUpdate({
          payload: { key: `community:c-${index}`, value },
        });
      }
      await jest.advanceTimersByTimeAsync(0);

      // A queued head is held and counted as pending.
      await expect(registry.findHead('community:c-300')).rejects.toThrow(
        ReplicatedStateNotReadyError,
      );
      // Past the queue the network is overflowed: no read answers missing or
      // partial, not even for a key the node never saw.
      await expect(registry.findHead('community:c-513')).rejects.toThrow(
        ReplicatedStateNotReadyError,
      );
      await expect(registry.findHead('community:unseen')).rejects.toThrow(
        ReplicatedStateNotReadyError,
      );
      await expect(
        registry.findPersistedHead('community:unseen'),
      ).rejects.toThrow(ReplicatedStateNotReadyError);
      expect(registry.hasPendingHeadAdmissions('community-other:')).toBe(true);

      // The held heads prove out: the network drains and is readmitted in full.
      verdict = 'accepted';
      await jest.advanceTimersByTimeAsync(10 * 60_000);

      // The rescan yields between batches of heads on the event loop.
      for (
        let turn = 0;
        turn < 1_000 && registry.hasPendingHeadAdmissions('community:');
        turn += 1
      ) {
        await new Promise((resolve) => setImmediate(resolve));
      }

      expect(registry.hasPendingHeadAdmissions('community:')).toBe(false);
      await expect(registry.findHead('community:c-513')).resolves.toEqual(
        expect.objectContaining({ id: 'c-513' }),
      );
      await expect(
        registry.findHead('community:unseen'),
      ).resolves.toBeUndefined();
      registry.clear();
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps one timer per held head however long it stays held or often it is received', async () => {
    const timersAfter = async (receipts: number): Promise<number> => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });

      try {
        const gate = mock<OrbitDBMutationGate>();
        const registry = new OrbitDBReplicatedStateRegistry();
        const firstNetwork = createStores();
        let peak = 0;

        gate.governs.mockImplementation(
          (collection) => collection === 'communityOperations',
        );
        gate.governsHead.mockReturnValue(false);
        gate.verdictOf.mockResolvedValue('pending');
        registry.addMutationGate(gate);
        await registry.register('network-1', firstNetwork.stores);

        for (let receipt = 0; receipt < receipts; receipt += 1) {
          firstNetwork.heads.emitUpdate({
            payload: {
              key: 'community:community-1',
              value: {
                communityOperations: [{ id: 'forged-1' }],
                id: 'community-1',
                updatedAt: 10,
              },
            },
          });
        }

        // The head is re-armed every 60 s, with no cap, for two hours.
        for (let second = 0; second < 7_200; second += 5) {
          await jest.advanceTimersByTimeAsync(5_000);
          peak = Math.max(peak, jest.getTimerCount());
        }

        expect(registry.hasPendingHeadAdmissions('community:')).toBe(true);
        registry.clear();

        return peak;
      } finally {
        jest.useRealTimers();
      }
    };

    const once = await timersAfter(1);
    const many = await timersAfter(50);

    expect(many).toBe(once);
  });

  describe('replicated documents the mutation gate has not admitted', () => {
    const gateOf = (
      collection: string,
      admitted: () => boolean,
    ): MockProxy<OrbitDBMutationGate> => {
      const gate = mock<OrbitDBMutationGate>();

      gate.governs.mockImplementation((name) => name === collection);
      gate.governsHead.mockReturnValue(false);
      gate.verdictOf.mockImplementation(() =>
        Promise.resolve(admitted() ? 'accepted' : 'pending'),
      );

      return gate;
    };

    beforeEach(() => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('offers a replayed call record again once the authorization it rests on replicates', async () => {
      let memberReplicated = false;
      const registry = new OrbitDBReplicatedStateRegistry();
      const { calls, stores } = createStores();
      const projected: unknown[] = [];

      calls.log = {
        get: async () => undefined,
        heads: jest.fn(async (): Promise<OrbitDBEntry[]> => [
          {
            hash: 'first',
            next: [],
            payload: { value: { id: 'call-start' } },
          },
        ]),
      };
      registry.addMutationGate(gateOf('calls', () => memberReplicated));
      await registry.register('network-1', stores);
      await registry.onDocumentUpdated(
        'calls',
        (document) => {
          projected.push(document.id);
        },
        { includeHistory: true },
      );

      expect(projected).toEqual([]);

      memberReplicated = true;
      await jest.advanceTimersByTimeAsync(2_000);

      expect(projected).toEqual(['call-start']);
      registry.clear();
    });

    it('tells which replayed documents wait to be offered again until they are admitted', async () => {
      let memberReplicated = false;
      const registry = new OrbitDBReplicatedStateRegistry();
      const { calls, stores } = createStores();

      calls.log = {
        get: () => Promise.resolve(undefined),
        heads: jest.fn((): Promise<OrbitDBEntry[]> =>
          Promise.resolve([
            {
              hash: 'first',
              next: [],
              payload: { value: { id: 'call:1' } },
            },
          ]),
        ),
      };
      registry.addMutationGate(gateOf('calls', () => memberReplicated));
      await registry.register('network-1', stores);
      await registry.onDocumentUpdated('calls', () => undefined, {
        includeHistory: true,
      });

      expect(registry.isDocumentPendingAdmission('calls', 'call:1')).toBe(true);
      expect(registry.isDocumentPendingAdmission('calls', 'call:2')).toBe(
        false,
      );
      expect(registry.isDocumentPendingAdmission('identities', 'call:1')).toBe(
        false,
      );

      memberReplicated = true;
      await jest.advanceTimersByTimeAsync(2_000);

      expect(registry.isDocumentPendingAdmission('calls', 'call:1')).toBe(
        false,
      );
      registry.clear();
    });

    it('answers a read of an overflowed store as pending until it is readmitted', async () => {
      let memberReplicated = false;
      const registry = new OrbitDBReplicatedStateRegistry();
      const { calls, stores } = createStores();
      const entries = Array.from({ length: 513 }, (_, index): OrbitDBEntry => ({
        hash: `call-${index}`,
        next: [],
        payload: { value: { id: `call:${index}` } },
      }));

      calls.log = {
        get: () => Promise.resolve(undefined),
        heads: jest.fn((): Promise<OrbitDBEntry[]> => Promise.resolve(entries)),
      };
      registry.addMutationGate(gateOf('calls', () => memberReplicated));
      await registry.register('network-1', stores);
      await registry.onDocumentUpdated('calls', () => undefined, {
        includeHistory: true,
      });

      // The 513th replayed call was dropped: it is not pending, the store is.
      expect(registry.isDocumentPendingAdmission('calls', 'call:512')).toBe(
        true,
      );
      expect(
        registry.isDocumentPendingAdmission('identities', 'call:512'),
      ).toBe(false);

      memberReplicated = true;
      await jest.advanceTimersByTimeAsync(4_000);
      await jest.advanceTimersByTimeAsync(0);

      expect(registry.isDocumentPendingAdmission('calls', 'call:512')).toBe(
        false,
      );
      registry.clear();
    });

    it('stops telling a document waits once its last attempt is over', async () => {
      const registry = new OrbitDBReplicatedStateRegistry();
      const { identities, stores } = createStores();

      registry.addMutationGate(gateOf('identities', () => false));
      await registry.register('network-1', stores);
      await registry.onDocumentUpdated('identities', () => undefined);
      identities.emitUpdate({
        payload: { key: 'identity-1', value: { id: 'identity-1' } },
      });
      await jest.advanceTimersByTimeAsync(0);

      expect(
        registry.isDocumentPendingAdmission('identities', 'identity-1'),
      ).toBe(true);

      await jest.advanceTimersByTimeAsync(2_000 + 10_000 + 60_000);

      expect(
        registry.isDocumentPendingAdmission('identities', 'identity-1'),
      ).toBe(false);
      registry.clear();
    });

    it.each(IdentityIdMother.aliases())(
      'never projects a replicated identity signed under %s of its key through the real gate',
      async (_, aliasOf) => {
        const ipfs = mock<IPFS>();
        const mapper = new IpfsIdentityMapper();
        const registry = new OrbitDBReplicatedStateRegistry();
        const { identities, stores } = createStores();
        const projected: Record<string, unknown>[] = [];
        const signer = await SignedIdentityMother.create();
        const aliasId = aliasOf(new IdentityId(signer.id)).valueOf();
        const recordOf = async (
          identity: Identity | IdentityPrimitives,
        ): Promise<{ key: string; value: Record<string, unknown> }> => {
          const primitives =
            identity instanceof Identity ? identity.toPrimitives() : identity;
          const cid =
            identity instanceof Identity
              ? (
                  await ipfs.calculateJSONId(mapper.toDocument(identity))
                ).valueOf()
              : 'bafy-unconstructible';

          return {
            key: cid,
            value: {
              cid,
              id: cid,
              identity: primitives,
              identityId: primitives.id,
              networkIds: primitives.networks,
              version: primitives.version,
            },
          };
        };

        ipfs.calculateJSONId.mockImplementation((data) =>
          Promise.resolve(
            new IPFSId(
              `bafy${createHash('sha256').update(JSON.stringify(data)).digest('hex')}`,
            ),
          ),
        );
        registry.addMutationGate(new OrbitDBIdentityMutationGate(ipfs));
        await registry.register('network-1', stores);
        await registry.onDocumentUpdated('identities', (document) => {
          projected.push(document);
        });

        identities.emitUpdate({
          payload: await recordOf(signer.build()),
        });
        await jest.advanceTimersByTimeAsync(0);

        expect(projected).toHaveLength(1);

        const alias = await recordOf(signer.primitives({ id: aliasId }));

        identities.emitUpdate({ payload: alias });
        await jest.advanceTimersByTimeAsync(0);

        expect(
          registry.isDocumentPendingAdmission('identities', alias.key),
        ).toBe(false);

        await jest.advanceTimersByTimeAsync(2_000 + 10_000 + 60_000);

        expect(
          registry.isDocumentPendingAdmission('identities', alias.key),
        ).toBe(false);
        expect(projected).toHaveLength(1);
        registry.clear();
      },
    );

    it('offers an updated document again once the authorization it rests on replicates', async () => {
      let memberReplicated = false;
      const registry = new OrbitDBReplicatedStateRegistry();
      const { identities, stores } = createStores();
      const projected: unknown[] = [];

      registry.addMutationGate(gateOf('identities', () => memberReplicated));
      await registry.register('network-1', stores);
      await registry.onDocumentUpdated('identities', (document) => {
        projected.push(document.id);
      });
      identities.emitUpdate({
        payload: { key: 'identity-1', value: { id: 'identity-1' } },
      });
      await jest.advanceTimersByTimeAsync(0);

      expect(projected).toEqual([]);

      memberReplicated = true;
      await jest.advanceTimersByTimeAsync(2_000);

      expect(projected).toEqual(['identity-1']);
      registry.clear();
    });

    it('offers a held document again as soon as the state it rests on replicates', async () => {
      const registry = new OrbitDBReplicatedStateRegistry();
      const { heads, identities, stores } = createStores();
      const projected: unknown[] = [];

      registry.addMutationGate(
        gateOf(
          'identities',
          () => registry.findCachedHead('identity:inviter') !== undefined,
        ),
      );
      await registry.register('network-1', stores);
      await registry.onDocumentUpdated('identities', (document) => {
        projected.push(document.id);
      });
      identities.emitUpdate({
        payload: { key: 'identity-1', value: { id: 'identity-1' } },
      });
      await jest.advanceTimersByTimeAsync(2_000 + 10_000);

      expect(projected).toEqual([]);

      heads.emitUpdate({
        payload: {
          key: 'identity:inviter',
          value: { identityId: 'inviter', updatedAt: 20 },
        },
      });
      await jest.advanceTimersByTimeAsync(5_000);

      expect(projected).toEqual(['identity-1']);
      registry.clear();
    });

    it('gives up on a document that stays pending after the last attempt', async () => {
      const registry = new OrbitDBReplicatedStateRegistry();
      const { identities, stores } = createStores();
      const gate = gateOf('identities', () => false);
      const projected: unknown[] = [];

      registry.addMutationGate(gate);
      await registry.register('network-1', stores);
      await registry.onDocumentUpdated('identities', (document) => {
        projected.push(document.id);
      });
      identities.emitUpdate({
        payload: { key: 'identity-1', value: { id: 'identity-1' } },
      });
      await jest.advanceTimersByTimeAsync(2_000 + 10_000 + 60_000);

      expect(gate.verdictOf).toHaveBeenCalledTimes(4);

      await jest.advanceTimersByTimeAsync(600_000);

      expect(gate.verdictOf).toHaveBeenCalledTimes(4);
      expect(projected).toEqual([]);
      registry.clear();
    });

    it('gives up on a held document even when new state replicates after the last attempt', async () => {
      const registry = new OrbitDBReplicatedStateRegistry();
      const { heads, identities, stores } = createStores();
      const gate = gateOf('identities', () => false);

      registry.addMutationGate(gate);
      await registry.register('network-1', stores);
      await registry.onDocumentUpdated('identities', () => undefined);
      identities.emitUpdate({
        payload: { key: 'identity-1', value: { id: 'identity-1' } },
      });
      await jest.advanceTimersByTimeAsync(2_000 + 10_000 + 60_000);
      heads.emitUpdate({
        payload: {
          key: 'identity:inviter',
          value: { identityId: 'inviter', updatedAt: 20 },
        },
      });
      await jest.advanceTimersByTimeAsync(600_000);

      expect(gate.verdictOf).toHaveBeenCalledTimes(4);
      registry.clear();
    });

    it('never projects a re-admitted document of a store that is no longer registered', async () => {
      let memberReplicated = false;
      const registry = new OrbitDBReplicatedStateRegistry();
      const { identities, stores } = createStores();
      const projected: unknown[] = [];

      registry.addMutationGate(gateOf('identities', () => memberReplicated));
      await registry.register('network-1', stores);
      await registry.onDocumentUpdated('identities', (document) => {
        projected.push(document.id);
      });
      identities.emitUpdate({
        payload: { key: 'identity-1', value: { id: 'identity-1' } },
      });
      await jest.advanceTimersByTimeAsync(0);
      registry.clear();

      memberReplicated = true;
      await jest.advanceTimersByTimeAsync(2_000);

      expect(projected).toEqual([]);
    });

    it('bounds how many held documents wait to be offered again', async () => {
      let memberReplicated = false;
      const registry = new OrbitDBReplicatedStateRegistry();
      const { identities, stores } = createStores();
      const flood = 1_000;
      const projected: unknown[] = [];

      registry.addMutationGate(gateOf('identities', () => memberReplicated));
      await registry.register('network-1', stores);
      await registry.onDocumentUpdated('identities', (document) => {
        projected.push(document.id);
      });

      for (let index = 0; index < flood; index++) {
        identities.emitUpdate({
          payload: {
            key: `identity-${index}`,
            value: { id: `identity-${index}` },
          },
        });
      }

      await jest.advanceTimersByTimeAsync(0);
      memberReplicated = true;
      await jest.advanceTimersByTimeAsync(2_000);

      expect(projected.length).toBeGreaterThan(0);
      expect(projected.length).toBeLessThan(flood);
      registry.clear();
    });
  });

  describe('gated records read from another network store', () => {
    const acceptingGate = (): MockProxy<OrbitDBMutationGate> => {
      const gate = mock<OrbitDBMutationGate>();

      gate.governs.mockImplementation((name) => name === 'contentReplication');
      gate.governsHead.mockReturnValue(false);
      gate.verdictOf.mockResolvedValue('accepted');

      return gate;
    };

    const registration = (
      id: string,
      networkId?: string,
    ): Record<string, unknown> => ({
      cid: id,
      id,
      ...(networkId ? { networkId } : {}),
      ownerIdentityId: 'owner',
      scopeType: 'content_replication',
      sizeBytes: 1,
    });

    const plantedNetworks = async (): Promise<{
      registry: OrbitDBReplicatedStateRegistry;
      firstNetworkStore: Store;
    }> => {
      const registry = new OrbitDBReplicatedStateRegistry();
      const firstNetwork = createStores();
      const secondNetwork = createStores();

      registry.addMutationGate(acceptingGate());
      await registry.register('network-1', firstNetwork.stores);
      await registry.register('network-2', secondNetwork.stores);
      await firstNetwork.contentReplication.put(
        registration('planted', 'network-2'),
      );
      await secondNetwork.contentReplication.put(
        registration('genuine', 'network-2'),
      );

      return { firstNetworkStore: firstNetwork.contentReplication, registry };
    };

    it('never returns a record of one network from the store of another', async () => {
      const { registry } = await plantedNetworks();
      const ofSecondNetwork = (document: Record<string, unknown>): boolean =>
        document.networkId === 'network-2';

      const everyNetwork = await registry.queryDocuments(
        'contentReplication',
        ofSecondNetwork,
      );
      const firstNetworkOnly = await registry.queryDocuments(
        'contentReplication',
        () => true,
        ['network-1'],
      );

      expect(everyNetwork.map((document) => document.id)).toEqual(['genuine']);
      expect(firstNetworkOnly).toEqual([]);
    });

    it('never projects a record of one network from the store of another', async () => {
      const { firstNetworkStore, registry } = await plantedNetworks();
      const projected: unknown[] = [];

      await registry.onDocumentUpdated('contentReplication', (document) => {
        projected.push(document.id);
      });
      firstNetworkStore.emitUpdate({
        payload: {
          key: 'updated',
          value: registration('updated', 'network-2'),
        },
      });
      await flushPromises();

      expect(projected).toEqual(['genuine']);
      registry.clear();
    });

    it('still returns a gated record that names no network', async () => {
      const { firstNetworkStore, registry } = await plantedNetworks();

      await firstNetworkStore.put(registration('unscoped'));

      const documents = await registry.queryDocuments(
        'contentReplication',
        () => true,
        ['network-1'],
      );

      expect(documents.map((document) => document.id)).toEqual(['unscoped']);
    });
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
        key: 'community:community-1',
        value: {
          id: 'community-1',
          name: 'old',
          updatedAt: 1,
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
    registry.cacheHeadLocally(key, {
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
    });
    firstNetwork.heads.emitUpdate({
      payload: {
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
      registry.cacheHeadLocally(key, {
        [collectionName]: [
          {
            id: `${collectionName}-1`,
            removed: true,
            updatedAt: 30,
          },
        ],
        id: key,
        updatedAt: 31,
      });
      firstNetwork.heads.emitUpdate({
        payload: {
          key,
          value: {
            [collectionName]: [
              {
                createdAt: 10,
                id: `${collectionName}-1`,
              },
            ],
            id: key,
            updatedAt: 40,
          },
        },
      });

      await expect(registry.findHead(key)).resolves.toEqual({
        [collectionName]: [
          {
            id: `${collectionName}-1`,
            removed: true,
            updatedAt: 30,
          },
        ],
        id: key,
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
        key: 'identity:identity-1',
        value: {
          cid: 'identity-v1',
          id: 'identity-1',
          identityId: 'identity-1',
          receivedAt: 200,
          version: 1,
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

  it('restores warm heads without rebuilding the replicated head log', async () => {
    const headCache = new InMemoryOrbitDBReplicatedHeadCache();
    const registry = OrbitDBReplicatedStateRegistry.withHeadCache(headCache);
    const firstNetwork = createStores();

    await headCache.save('network-1', 'community:community-1', {
      id: 'community-1',
      networkId: 'network-1',
      updatedAt: 1,
    });
    await headCache.markWarm('network-1', JSON.stringify(['head-1']));
    firstNetwork.heads.log = {
      heads: jest.fn(async () => [{ hash: 'head-1' }]),
    };

    await registry.register('network-1', firstNetwork.stores);

    expect(registry.findCachedHeadsByPrefix('community:')).toEqual([
      {
        id: 'community-1',
        networkId: 'network-1',
        updatedAt: 1,
      },
    ]);
    expect(firstNetwork.heads.all).not.toHaveBeenCalled();
  });

  it('does not rebuild a warm local head cache when the OrbitDB log heads are unchanged', async () => {
    const headCache = new InMemoryOrbitDBReplicatedHeadCache();
    const registry = OrbitDBReplicatedStateRegistry.withHeadCache(headCache);
    const firstNetwork = createStores();
    const headSignature = JSON.stringify(['head-1']);

    await headCache.save('network-1', 'community:community-1', {
      id: 'community-1',
      networkId: 'network-1',
      updatedAt: 1,
    });
    await headCache.markWarm('network-1', headSignature);
    firstNetwork.heads.log = {
      heads: jest.fn(async () => [{ hash: 'head-1' }]),
    };

    await registry.register('network-1', firstNetwork.stores);

    expect(registry.findCachedHead('community:community-1')).toEqual({
      id: 'community-1',
      networkId: 'network-1',
      updatedAt: 1,
    });
    expect(firstNetwork.heads.all).not.toHaveBeenCalled();
    expect(firstNetwork.heads.put).not.toHaveBeenCalled();
  });

  it('rebuilds a warm local head cache when the OrbitDB log heads changed', async () => {
    const headCache = new InMemoryOrbitDBReplicatedHeadCache();
    const registry = OrbitDBReplicatedStateRegistry.withHeadCache(headCache);
    const firstNetwork = createStores();

    await headCache.save('network-1', 'community:community-1', {
      id: 'community-1',
      networkId: 'network-1',
      updatedAt: 1,
    });
    await headCache.markWarm('network-1', JSON.stringify(['head-1']));
    firstNetwork.heads.log = {
      heads: jest.fn(async () => [{ hash: 'head-2' }]),
    };
    firstNetwork.heads.all.mockResolvedValue([
      {
        key: 'community:community-1',
        value: {
          id: 'community-1',
          networkId: 'network-1',
          updatedAt: 2,
        },
      },
    ]);

    await registry.register('network-1', firstNetwork.stores);

    expect(registry.findCachedHead('community:community-1')).toEqual({
      id: 'community-1',
      networkId: 'network-1',
      updatedAt: 2,
    });
    expect(firstNetwork.heads.all).toHaveBeenCalledTimes(1);
    expect(firstNetwork.heads.put).not.toHaveBeenCalled();
    await expect(
      headCache.findReconciledHeadSignature('network-1'),
    ).resolves.toBe(JSON.stringify(['head-2']));
  });

  it('rebuilds a warm head cache whose heads log cannot be compared', async () => {
    const headCache = new InMemoryOrbitDBReplicatedHeadCache();
    const registry = OrbitDBReplicatedStateRegistry.withHeadCache(headCache);
    const restarted = createStores();

    await headCache.save('network-1', 'community:community-1', {
      id: 'community-1',
      networkId: 'network-1',
      updatedAt: 1,
    });
    await headCache.markWarm('network-1');
    restarted.heads.all.mockResolvedValue([
      {
        key: 'community:community-1',
        value: {
          id: 'community-1',
          networkId: 'network-1',
          updatedAt: 2,
        },
      },
    ]);

    await registry.register('network-1', restarted.stores);

    expect(restarted.heads.all).toHaveBeenCalledTimes(1);
    expect(registry.findCachedHead('community:community-1')).toEqual({
      id: 'community-1',
      networkId: 'network-1',
      updatedAt: 2,
    });
  });

  it('stays not open when a warm head cache whose heads log cannot be compared fails to rebuild', async () => {
    const headCache = new InMemoryOrbitDBReplicatedHeadCache();
    const registry = OrbitDBReplicatedStateRegistry.withHeadCache(headCache);
    const restarted = createStores();
    const missingBlock = new DOMException(
      'The operation was aborted due to timeout',
      'TimeoutError',
    );

    await headCache.save('network-1', 'community:community-1', {
      id: 'community-1',
      networkId: 'network-1',
      updatedAt: 1,
    });
    await headCache.markWarm('network-1');
    restarted.heads.all.mockRejectedValueOnce(missingBlock);

    await expect(
      registry.register('network-1', restarted.stores),
    ).rejects.toThrow();
    expect(registry.isOpen()).toBe(false);
    registry.clear();
  });

  it('stays not open when a peer join rebuild fails after a successful rebuild', async () => {
    const headCache = new InMemoryOrbitDBReplicatedHeadCache();
    const registry = OrbitDBReplicatedStateRegistry.withHeadCache(headCache);
    const { heads, stores } = createStores();
    const missingBlock = new DOMException(
      'The operation was aborted due to timeout',
      'TimeoutError',
    );

    await registry.register('network-1', stores);
    expect(registry.isOpen()).toBe(true);

    heads.all.mockRejectedValueOnce(missingBlock);
    heads.emitJoin('peer-1', []);
    await flushPromises();
    expect(registry.isOpen()).toBe(false);

    heads.emitJoin('peer-2', []);
    await flushPromises();
    expect(registry.isOpen()).toBe(true);
    registry.clear();
  });

  it('keeps serving cached heads while a peer join rebuilds the head cache', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const network = createStores();
    const record = (updatedAt: number): Entry => ({
      key: 'community:community-1',
      value: { id: 'community-1', networkId: 'network-1', updatedAt },
    });

    network.heads.all.mockResolvedValue([record(1)]);
    await registry.register('network-1', network.stores);

    let release: (entries: Entry[]) => void = () => undefined;

    network.heads.all.mockReturnValue(
      new Promise<Entry[]>((resolve) => {
        release = resolve;
      }),
    );
    network.heads.emitJoin('peer-1', [{ hash: 'head-2' }] as OrbitDBEntry[]);
    await new Promise((resolve) => setImmediate(resolve));

    await expect(registry.findHead('community:community-1')).resolves.toEqual(
      record(1).value,
    );

    release([record(2)]);
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    await expect(registry.findHead('community:community-1')).resolves.toEqual(
      record(2).value,
    );
  });

  it('removes stale derived aliases when rebuilding a changed OrbitDB head cache', async () => {
    const headCache = new InMemoryOrbitDBReplicatedHeadCache();
    const registry = OrbitDBReplicatedStateRegistry.withHeadCache(headCache);
    const firstNetwork = createStores();

    await headCache.save('network-1', 'identity:identity-1', {
      cid: 'identity-v1',
      handle: 'old-handle',
      id: 'identity-1',
      identityId: 'identity-1',
      lastEventId: 'event-1',
      networkIds: ['network-1'],
      receivedAt: 1,
      version: 1,
    });
    await headCache.markWarm('network-1', JSON.stringify(['head-1']));
    firstNetwork.heads.log = {
      heads: jest.fn(async () => [{ hash: 'head-2' }]),
    };
    firstNetwork.heads.all.mockResolvedValue([
      {
        key: 'identity:identity-1',
        value: {
          cid: 'identity-v2',
          handle: 'new-handle',
          id: 'identity-1',
          identityId: 'identity-1',
          lastEventId: 'event-2',
          networkIds: ['network-1'],
          receivedAt: 2,
          version: 2,
        },
      },
    ]);

    await registry.register('network-1', firstNetwork.stores);

    expect(
      registry.findCachedHead('identity-handle:old-handle'),
    ).toBeUndefined();
    expect(registry.findCachedHead('identity-handle:new-handle')).toEqual(
      expect.objectContaining({
        cid: 'identity-v2',
        identityId: 'identity-1',
        version: 2,
      }),
    );
    await expect(headCache.findByNetworkId('network-1')).resolves.toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({ key: 'identity-handle:old-handle' }),
      ]),
    );
    expect(firstNetwork.heads.put).not.toHaveBeenCalled();
  });

  it('keeps other network head caches while rebuilding one network', async () => {
    const headCache = new InMemoryOrbitDBReplicatedHeadCache();
    const registry = OrbitDBReplicatedStateRegistry.withHeadCache(headCache);
    const firstNetwork = createStores();
    const secondNetwork = createStores();

    await headCache.save('network-1', 'identity-handle:old-handle', {
      handle: 'old-handle',
      id: 'identity-1',
      identityId: 'identity-1',
      networkIds: ['network-1'],
      version: 1,
    });
    await headCache.save('network-2', 'identity-handle:other-handle', {
      handle: 'other-handle',
      id: 'identity-2',
      identityId: 'identity-2',
      networkIds: ['network-2'],
      version: 1,
    });
    await headCache.markWarm('network-1', JSON.stringify(['head-1']));
    await headCache.markWarm('network-2', JSON.stringify(['head-1']));
    firstNetwork.heads.log = {
      heads: jest.fn(async () => [{ hash: 'head-2' }]),
    };
    secondNetwork.heads.log = {
      heads: jest.fn(async () => [{ hash: 'head-1' }]),
    };
    firstNetwork.heads.all.mockResolvedValue([]);

    await registry.register('network-1', firstNetwork.stores);
    await registry.register('network-2', secondNetwork.stores);

    expect(
      registry.findCachedHead('identity-handle:old-handle'),
    ).toBeUndefined();
    expect(registry.findCachedHead('identity-handle:other-handle')).toEqual(
      expect.objectContaining({
        identityId: 'identity-2',
        networkIds: ['network-2'],
      }),
    );
    expect(secondNetwork.heads.all).not.toHaveBeenCalled();
  });

  it('rebuilds a warm local head cache when the OrbitDB head signature cannot be read', async () => {
    const headCache = new InMemoryOrbitDBReplicatedHeadCache();
    const registry = OrbitDBReplicatedStateRegistry.withHeadCache(headCache);
    const firstNetwork = createStores();

    await headCache.save('network-1', 'community:community-1', {
      id: 'community-1',
      networkId: 'network-1',
      updatedAt: 1,
    });
    await headCache.markWarm('network-1', JSON.stringify(['head-1']));
    firstNetwork.heads.log = {
      heads: jest.fn(async () => {
        throw new Error('head storage unavailable');
      }),
    };
    firstNetwork.heads.all.mockResolvedValue([
      {
        key: 'community:community-1',
        value: {
          id: 'community-1',
          networkId: 'network-1',
          updatedAt: 2,
        },
      },
    ]);

    await registry.register('network-1', firstNetwork.stores);

    expect(registry.findCachedHead('community:community-1')).toEqual({
      id: 'community-1',
      networkId: 'network-1',
      updatedAt: 2,
    });
    expect(firstNetwork.heads.all).toHaveBeenCalledTimes(1);
    expect(firstNetwork.heads.put).not.toHaveBeenCalled();
  });

  it('reconciles missed replicated heads once after peer synchronization', async () => {
    const headCache = new InMemoryOrbitDBReplicatedHeadCache();
    const registry = OrbitDBReplicatedStateRegistry.withHeadCache(headCache);
    const firstNetwork = createStores();

    await headCache.save('network-1', 'notification:notification-1', {
      createdAt: 1,
      id: 'notification-1',
      updatedAt: 1,
    });
    await headCache.markWarm('network-1', JSON.stringify(['head-1']));
    firstNetwork.heads.log = {
      heads: jest.fn(async () => [{ hash: 'head-1' }]),
    };

    await registry.register('network-1', firstNetwork.stores);
    firstNetwork.heads.all.mockResolvedValue([
      {
        key: 'notification:notification-1',
        value: {
          createdAt: 1,
          id: 'notification-1',
          updatedAt: 2,
        },
      },
    ]);
    firstNetwork.heads.all.mockClear();
    firstNetwork.heads.put.mockClear();

    firstNetwork.heads.emitJoin('peer-1', [{ hash: 'head-2' }]);
    await flushPromises();

    expect(registry.findCachedHead('notification:notification-1')).toEqual({
      createdAt: 1,
      id: 'notification-1',
      updatedAt: 2,
    });
    expect(firstNetwork.heads.all).toHaveBeenCalledTimes(1);
    expect(firstNetwork.heads.put).not.toHaveBeenCalled();

    firstNetwork.heads.emitJoin('peer-2', [{ hash: 'head-2' }]);
    await flushPromises();

    expect(firstNetwork.heads.all).toHaveBeenCalledTimes(1);
  });

  it('preserves document projections while replacing replicated heads after synchronization', async () => {
    const headCache = new InMemoryOrbitDBReplicatedHeadCache();
    const registry = OrbitDBReplicatedStateRegistry.withHeadCache(headCache);
    const firstNetwork = createStores();

    await headCache.save('network-1', 'notification:notification-1', {
      createdAt: 1,
      id: 'notification-1',
      updatedAt: 1,
    });
    await headCache.markWarm('network-1', JSON.stringify(['head-1']));
    firstNetwork.heads.log = {
      heads: jest.fn(async () => [{ hash: 'head-1' }]),
    };

    await registry.register('network-1', firstNetwork.stores);
    registry.cacheHeadLocally('keychain:identity-1', {
      cid: 'keychain-v1',
      id: 'keychain-v1',
      ownerIdentityId: 'identity-1',
      receivedAt: 1,
      version: 1,
    });
    firstNetwork.heads.all.mockResolvedValue([
      {
        key: 'notification:notification-1',
        value: {
          createdAt: 1,
          id: 'notification-1',
          updatedAt: 2,
        },
      },
    ]);

    firstNetwork.heads.emitJoin('peer-1', [{ hash: 'head-2' }]);
    await flushPromises();

    expect(registry.findCachedHead('keychain:identity-1')).toEqual(
      expect.objectContaining({
        cid: 'keychain-v1',
        ownerIdentityId: 'identity-1',
      }),
    );
    expect(registry.findCachedHead('notification:notification-1')).toEqual({
      createdAt: 1,
      id: 'notification-1',
      updatedAt: 2,
    });
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
    await headCache.markWarm('network-1', JSON.stringify(['head-1']));
    firstNetwork.heads.log = {
      heads: jest.fn(async () => [{ hash: 'head-1' }]),
    };
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

  it('replaces collection heads in projected, replicated and durable caches', async () => {
    const headCache = new InMemoryOrbitDBReplicatedHeadCache();
    const registry = OrbitDBReplicatedStateRegistry.withHeadCache(headCache);
    const firstNetwork = createStores();
    const key = 'replacement-test:conversation-1';
    let finishWrite!: () => void;
    const pendingWrite = new Promise<void>((resolve) => {
      finishWrite = resolve;
    });

    registry.registerHeadRecordMerger(
      'replacement-test:',
      (current, candidate) => ({
        ...candidate,
        reactions: [
          ...((current?.reactions as Record<string, unknown>[] | undefined) ??
            []),
          ...((candidate.reactions as Record<string, unknown>[] | undefined) ??
            []),
        ],
      }),
    );
    await registry.register('network-1', firstNetwork.stores);
    await registry.putHead(
      key,
      {
        id: key,
        reactions: [{ id: 'reaction-1', updatedAt: 1 }],
        updatedAt: 1,
      },
      ['network-1'],
    );
    firstNetwork.heads.put.mockImplementationOnce(async () => {
      await pendingWrite;

      return key;
    });

    const replacement = registry.putHeadExactly(
      key,
      { id: key, reactions: [], updatedAt: 2 },
      ['network-1'],
    );
    await Promise.resolve();

    expect(registry.findCachedHead(key)).toEqual({
      id: key,
      reactions: [],
      updatedAt: 2,
    });
    finishWrite();
    await replacement;
    expect(registry.findCachedHead(key)).toEqual({
      id: key,
      reactions: [],
      updatedAt: 2,
    });
    await expect(
      headCache.findByNetworkId('network-1'),
    ).resolves.toContainEqual({
      key,
      value: { id: key, reactions: [], updatedAt: 2 },
    });
  });

  it('rolls back an exact projection when durable replacement fails', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const firstNetwork = createStores();
    const key = 'replacement-test:conversation-failure';

    await registry.register('network-1', firstNetwork.stores);
    await registry.putHead(
      key,
      { id: key, reactions: [{ id: 'reaction-1' }], updatedAt: 1 },
      ['network-1'],
    );
    firstNetwork.heads.put.mockRejectedValueOnce(new Error('write failed'));

    await expect(
      registry.putHeadExactly(key, { id: key, reactions: [], updatedAt: 2 }, [
        'network-1',
      ]),
    ).rejects.toThrow('write failed');
    expect(registry.findCachedHead(key)).toEqual({
      id: key,
      reactions: [{ id: 'reaction-1' }],
      updatedAt: 1,
    });
  });

  it('preserves a newer exact projection when an older queued write fails', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const firstNetwork = createStores();
    const key = 'replacement-test:conversation-queued';
    let failOlderWrite!: () => void;
    let finishNewerWrite!: () => void;
    let newerWriteStarted!: () => void;
    const olderWriteReleased = new Promise<void>((resolve) => {
      failOlderWrite = resolve;
    });
    const newerWriteReleased = new Promise<void>((resolve) => {
      finishNewerWrite = resolve;
    });
    const newerWriteEntered = new Promise<void>((resolve) => {
      newerWriteStarted = resolve;
    });

    await registry.register('network-1', firstNetwork.stores);
    firstNetwork.heads.put
      .mockImplementationOnce(async () => {
        await olderWriteReleased;
        throw new Error('older write failed');
      })
      .mockImplementationOnce(async () => {
        newerWriteStarted();
        await newerWriteReleased;

        return key;
      });
    const olderReplacement = registry.putHeadExactly(
      key,
      { generation: 1, id: key },
      ['network-1'],
    );
    const olderFailure =
      expect(olderReplacement).rejects.toThrow('older write failed');
    const newerReplacement = registry.putHeadExactly(
      key,
      { generation: 2, id: key },
      ['network-1'],
    );

    expect(registry.findCachedHead(key)).toEqual({ generation: 2, id: key });
    failOlderWrite();
    await olderFailure;
    await newerWriteEntered;
    expect(registry.findCachedHead(key)).toEqual({ generation: 2, id: key });
    finishNewerWrite();
    await newerReplacement;
  });

  it('bootstraps document projections from canonical stores', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const firstNetwork = createStores();
    const listener = jest.fn();

    await firstNetwork.calls.put({
      id: 'call-1',
      networkId: 'network-1',
    });
    await registry.register('network-1', firstNetwork.stores);
    await registry.onDocumentUpdated('calls', listener);

    expect(listener).toHaveBeenCalledWith({
      id: 'call-1',
      networkId: 'network-1',
    });
  });

  it('subscribes only stores with active document projections', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const firstNetwork = createStores();

    await registry.register('network-1', firstNetwork.stores);

    expect(firstNetwork.calls.events.on).not.toHaveBeenCalled();
    expect(firstNetwork.communityOperations.events.on).not.toHaveBeenCalled();

    await registry.onDocumentUpdated('calls', jest.fn());

    expect(firstNetwork.calls.events.on).toHaveBeenCalledTimes(2);
    expect(firstNetwork.calls.events.on).toHaveBeenCalledWith(
      'update',
      expect.any(Function),
    );
    expect(firstNetwork.calls.events.on).toHaveBeenCalledWith(
      'join',
      expect.any(Function),
    );
    expect(firstNetwork.communityOperations.events.on).not.toHaveBeenCalled();
  });

  it('projects documents received through OrbitDB updates', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const firstNetwork = createStores();
    const listener = jest.fn();

    await registry.onDocumentUpdated('calls', listener);
    await registry.register('network-1', firstNetwork.stores);
    firstNetwork.calls.emitUpdate({
      payload: {
        value: {
          id: 'call-1',
          networkId: 'network-1',
        },
      },
    });
    await flushPromises();

    expect(listener).toHaveBeenCalledWith({
      id: 'call-1',
      networkId: 'network-1',
    });
  });

  it('reconciles persisted documents after OrbitDB completes head synchronization', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const firstNetwork = createStores();
    const listener = jest.fn();

    await registry.register('network-1', firstNetwork.stores);
    await registry.onDocumentUpdated('identities', listener);
    listener.mockClear();
    firstNetwork.identities.all.mockClear();
    await firstNetwork.identities.put({
      cid: 'identity-v2',
      id: 'identity-1',
      identityId: 'identity-1',
      networkIds: ['network-1'],
      version: 2,
    });

    firstNetwork.identities.emitJoin('peer-1', [{ hash: 'head-1' }]);
    await flushPromises();

    expect(listener).toHaveBeenCalledWith({
      cid: 'identity-v2',
      id: 'identity-1',
      identityId: 'identity-1',
      networkIds: ['network-1'],
      version: 2,
    });
    expect(firstNetwork.identities.all).toHaveBeenCalledTimes(1);
  });

  it('does not reconcile the same OrbitDB heads more than once', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const firstNetwork = createStores();
    const listener = jest.fn();

    await registry.register('network-1', firstNetwork.stores);
    await registry.onDocumentUpdated('identities', listener);
    listener.mockClear();
    firstNetwork.identities.all.mockClear();
    await firstNetwork.identities.put({
      cid: 'identity-v2',
      id: 'identity-1',
      identityId: 'identity-1',
      networkIds: ['network-1'],
      version: 2,
    });

    firstNetwork.identities.emitJoin('peer-1', [{ hash: 'head-1' }]);
    await flushPromises();
    listener.mockClear();
    firstNetwork.identities.all.mockClear();
    firstNetwork.identities.emitJoin('peer-1', [{ hash: 'head-1' }]);
    await flushPromises();

    expect(listener).not.toHaveBeenCalled();
    expect(firstNetwork.identities.all).not.toHaveBeenCalled();
  });

  it('does not repeatedly reconcile an empty OrbitDB document store', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const firstNetwork = createStores();
    const listener = jest.fn();

    await registry.register('network-1', firstNetwork.stores);
    await registry.onDocumentUpdated('identities', listener);
    listener.mockClear();
    firstNetwork.identities.all.mockClear();

    firstNetwork.identities.emitJoin('peer-1', []);
    await flushPromises();
    firstNetwork.identities.emitJoin('peer-2', []);
    await flushPromises();

    expect(listener).not.toHaveBeenCalled();
    expect(firstNetwork.identities.all).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent reconciliation for the same OrbitDB heads', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const firstNetwork = createStores();
    const listener = jest.fn();
    const delayedRecords = deferred<Entry[]>();

    await registry.register('network-1', firstNetwork.stores);
    await registry.onDocumentUpdated('identities', listener);
    listener.mockClear();
    firstNetwork.identities.all.mockClear();
    firstNetwork.identities.all.mockImplementationOnce(
      async () => delayedRecords.promise,
    );

    firstNetwork.identities.emitJoin('peer-1', [{ hash: 'head-1' }]);
    firstNetwork.identities.emitJoin('peer-2', [{ hash: 'head-1' }]);
    await flushPromises();

    expect(firstNetwork.identities.all).toHaveBeenCalledTimes(1);
    delayedRecords.resolve([
      {
        key: 'identity-1',
        value: {
          cid: 'identity-v2',
          id: 'identity-1',
          identityId: 'identity-1',
          networkIds: ['network-1'],
          version: 2,
        },
      },
    ]);
    await flushPromises();

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('coalesces a burst of changed OrbitDB heads to the latest state', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const firstNetwork = createStores();
    const listener = jest.fn();
    const delayedRecords = deferred<Entry[]>();

    await registry.register('network-1', firstNetwork.stores);
    await registry.onDocumentUpdated('identities', listener);
    listener.mockClear();
    firstNetwork.identities.all.mockClear();
    firstNetwork.identities.all.mockImplementationOnce(
      async () => delayedRecords.promise,
    );

    firstNetwork.identities.emitJoin('peer-1', [{ hash: 'head-1' }]);
    firstNetwork.identities.emitJoin('peer-2', [{ hash: 'head-2' }]);
    firstNetwork.identities.emitJoin('peer-3', [{ hash: 'head-3' }]);
    await flushPromises();

    expect(firstNetwork.identities.all).toHaveBeenCalledTimes(1);
    delayedRecords.resolve([]);
    await flushPromises();

    expect(firstNetwork.identities.all).toHaveBeenCalledTimes(2);
    firstNetwork.identities.emitJoin('peer-3', [{ hash: 'head-3' }]);
    await flushPromises();
    expect(firstNetwork.identities.all).toHaveBeenCalledTimes(2);
  });

  it('reconciles again when the OrbitDB heads change', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const firstNetwork = createStores();
    const listener = jest.fn();

    await registry.register('network-1', firstNetwork.stores);
    await registry.onDocumentUpdated('identities', listener);
    listener.mockClear();
    firstNetwork.identities.all.mockClear();
    await firstNetwork.identities.put({
      cid: 'identity-v1',
      id: 'identity-1',
      identityId: 'identity-1',
      networkIds: ['network-1'],
      version: 1,
    });
    firstNetwork.identities.put.mockClear();
    firstNetwork.heads.put.mockClear();

    firstNetwork.identities.emitJoin('peer-1', [{ hash: 'head-1' }]);
    await flushPromises();
    firstNetwork.identities.emitJoin('peer-1', [{ hash: 'head-2' }]);
    await flushPromises();

    expect(firstNetwork.identities.all).toHaveBeenCalledTimes(2);
    expect(firstNetwork.identities.put).not.toHaveBeenCalled();
    expect(firstNetwork.heads.put).not.toHaveBeenCalled();
  });

  it('bootstraps projections when a network is registered later', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const firstNetwork = createStores();
    const listener = jest.fn();

    await firstNetwork.calls.put({
      id: 'call-1',
      networkId: 'network-1',
    });
    await registry.onDocumentUpdated('calls', listener);
    await registry.register('network-1', firstNetwork.stores);

    expect(listener).toHaveBeenCalledWith({
      id: 'call-1',
      networkId: 'network-1',
    });
  });

  it('yields while bootstrapping a projection from an existing store', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const firstNetwork = createStores();
    const listener = jest.fn();
    const setImmediateSpy = jest.spyOn(global, 'setImmediate');

    for (let index = 0; index < 17; index++) {
      await firstNetwork.calls.put({
        id: `call-${index}`,
        networkId: 'network-1',
      });
    }

    await registry.register('network-1', firstNetwork.stores);
    await registry.onDocumentUpdated('calls', listener);

    expect(listener).toHaveBeenCalledTimes(17);
    expect(setImmediateSpy).toHaveBeenCalled();
    setImmediateSpy.mockRestore();
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
