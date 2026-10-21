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
import Kernel from '@haskou/ddd-kernel';
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
        getSynchronizedPeerIds: (): string[] => [],
        name,
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

  describe('heads a merger cannot judge yet', () => {
    type HeadRecord = { key: string; value: Record<string, unknown> };

    const AUTHORIZATION = {
      key: 'authorization:owner',
      value: { owner: 'owner' },
    };

    /** Newest first, like the OrbitDB head history reader yields it. */
    function logOf(records: HeadRecord[]): NonNullable<Store['log']> {
      const entries: OrbitDBEntry[] = records.map((payload, index) => ({
        hash: `entry-${index}`,
        next: index + 1 < records.length ? [`entry-${index + 1}`] : [],
        payload,
      }));
      const byHash = new Map(entries.map((entry) => [entry.hash, entry]));

      return {
        get: async (hash) => byHash.get(hash),
        heads: jest.fn(async () => entries.slice(0, 1)),
      };
    }

    function sealingOf(device: string): HeadRecord {
      return { key: `sealing:owner:${device}`, value: { device } };
    }

    /** A sealing head is judged against the authorization head it depends on. */
    function registerDependentMergers(
      registry: OrbitDBReplicatedStateRegistry,
    ): void {
      registry.registerHeadRecordMerger(
        'authorization:',
        (_current, candidate) => candidate,
      );
      registry.registerHeadRecordMerger('sealing:', (current, candidate) =>
        registry.findSettledCachedHead(AUTHORIZATION.key)
          ? (current ?? candidate)
          : undefined,
      );
    }

    async function registeredWith(
      records: HeadRecord[],
      registry = new OrbitDBReplicatedStateRegistry(),
    ): Promise<OrbitDBReplicatedStateRegistry> {
      const { heads, stores } = createStores();

      heads.all.mockResolvedValue(records);
      heads.log = logOf(records);
      registerDependentMergers(registry);
      await registry.register('network-1', stores);

      return registry;
    }

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('answers a settled read as not ready before any network registers', () => {
      const registry = new OrbitDBReplicatedStateRegistry();

      expect(() => registry.findSettledCachedHead(AUTHORIZATION.key)).toThrow(
        ReplicatedStateNotReadyError,
      );
    });

    it('answers a settled read of an uncached head as not ready while the head cache reconciles', async () => {
      const registry = new OrbitDBReplicatedStateRegistry();
      const { heads, stores } = createStores();
      let release: (records: Entry[]) => void = () => undefined;

      heads.all.mockReturnValue(
        new Promise<Entry[]>((resolve) => {
          release = resolve;
        }),
      );
      const registering = registry.register('network-1', stores);
      await new Promise<void>((resolve) => setImmediate(resolve));

      expect(() => registry.findSettledCachedHead(AUTHORIZATION.key)).toThrow(
        ReplicatedStateNotReadyError,
      );

      release([]);
      await registering;

      expect(registry.findSettledCachedHead(AUTHORIZATION.key)).toBeUndefined();
      registry.clear();
    });

    it('merges a head reconciled before the head its merger depends on', async () => {
      const sealing = sealingOf('device');
      const registry = await registeredWith([sealing, AUTHORIZATION]);

      await expect(registry.findHead(sealing.key)).resolves.toEqual(
        sealing.value,
      );
      expect(registry.hasDeferredHeadsUnder('sealing:')).toBe(false);
      registry.clear();
    });

    it('merges every deferred head even when more were deferred than it tracks one by one', async () => {
      const sealings = Array.from({ length: 4_097 }, (_, index) =>
        sealingOf(`device-${index}`),
      );
      const registry = await registeredWith([...sealings, AUTHORIZATION]);

      await expect(registry.findHead(sealings[0].key)).resolves.toEqual(
        sealings[0].value,
      );
      await expect(registry.findHead(sealings[4_096].key)).resolves.toEqual(
        sealings[4_096].value,
      );
      expect(registry.hasDeferredHeadsUnder('sealing:')).toBe(false);
      registry.clear();
    }, 30_000);

    it('marks the head cache warm only once every deferred head is merged', async () => {
      const headCache = new InMemoryOrbitDBReplicatedHeadCache();
      const registry = await registeredWith(
        [sealingOf('device'), AUTHORIZATION],
        OrbitDBReplicatedStateRegistry.withHeadCache(headCache),
      );

      await expect(headCache.isWarm('network-1')).resolves.toBe(true);
      await expect(headCache.findByNetworkId('network-1')).resolves.toEqual(
        expect.arrayContaining([
          { key: 'sealing:owner:device', value: { device: 'device' } },
        ]),
      );
      registry.clear();
    });

    it('merges a head deferred on a held key once the hold ends', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });

      try {
        const gate = mock<OrbitDBMutationGate>();
        const registry = new OrbitDBReplicatedStateRegistry();
        const { heads, stores } = createStores();
        const sealing = sealingOf('device');
        const admitted = {
          key: AUTHORIZATION.key,
          value: { owner: 'owner', updatedAt: 12 },
        };

        gate.governs.mockImplementation(
          (collection) => collection === 'communityOperations',
        );
        gate.governsHead.mockReturnValue(false);
        gate.verdictOf.mockResolvedValue('pending');
        registry.addMutationGate(gate);
        registerDependentMergers(registry);
        await registry.register('network-1', stores);
        heads.emitUpdate({
          payload: {
            key: AUTHORIZATION.key,
            value: {
              communityOperations: [{ id: 'forged-1' }],
              owner: 'owner',
              updatedAt: 10,
            },
          },
        });
        await jest.advanceTimersByTimeAsync(0);
        heads.emitUpdate({ payload: sealing });
        await jest.advanceTimersByTimeAsync(0);
        expect(registry.hasDeferredHeadsUnder('sealing:')).toBe(true);

        heads.log = logOf([admitted, sealing]);
        heads.emitUpdate({ payload: admitted });
        await jest.advanceTimersByTimeAsync(0);

        expect(registry.hasDeferredHeadsUnder('sealing:')).toBe(false);
        expect(registry.findCachedHead(sealing.key)).toEqual(sealing.value);
        registry.clear();
      } finally {
        jest.useRealTimers();
      }
    });

    describe('when the merger still cannot judge a head after reconciliation', () => {
      const warn = jest.fn();
      const debug = jest.fn();

      async function registeredWithUnjudgeable(
        registry = new OrbitDBReplicatedStateRegistry(),
      ): Promise<OrbitDBReplicatedStateRegistry> {
        const sealing = sealingOf('device');
        const { heads, stores } = createStores();

        jest
          .spyOn(Kernel, 'logger', 'get')
          .mockReturnValue({ debug, warn } as unknown as typeof Kernel.logger);
        heads.all.mockResolvedValue([sealing]);
        heads.log = logOf([sealing]);
        registry.registerHeadRecordMerger('sealing:', () => {
          throw new ReplicatedStateNotReadyError();
        });
        await registry.register('network-1', stores);

        return registry;
      }

      it('keeps the head pending under its prefix only', async () => {
        const registry = await registeredWithUnjudgeable();

        expect(registry.hasDeferredHeadsUnder('sealing:')).toBe(true);
        expect(registry.hasDeferredHeadsUnder('authorization:')).toBe(false);
        registry.clear();
      });

      it('does not report the head as incompatible state', async () => {
        const registry = await registeredWithUnjudgeable();

        expect(warn).not.toHaveBeenCalledWith(
          'Rejected incompatible replicated state',
        );
        registry.clear();
      });

      it('leaves the head cache cold so the next start reconciles again', async () => {
        const headCache = new InMemoryOrbitDBReplicatedHeadCache();
        const registry = await registeredWithUnjudgeable(
          OrbitDBReplicatedStateRegistry.withHeadCache(headCache),
        );

        await expect(headCache.isWarm('network-1')).resolves.toBe(false);
        registry.clear();
      });
    });
  });

  describe('rehydrateHead', () => {
    it('resolves whether any network stores the key', async () => {
      const registry = new OrbitDBReplicatedStateRegistry();
      const { heads, stores } = createStores();

      await registry.register('network-1', stores);
      await heads.put('community:stored', { id: 'stored' });

      await expect(registry.rehydrateHead('community:stored')).resolves.toBe(
        true,
      );
      await expect(registry.rehydrateHead('community:unseen')).resolves.toBe(
        false,
      );
      registry.clear();
    });
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

      await expect(registry.findHead('community:community-1')).rejects.toThrow(
        ReplicatedStateNotReadyError,
      );

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

      await expect(registry.findHead('community:community-1')).rejects.toThrow(
        ReplicatedStateNotReadyError,
      );

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

      // The admitted join-1 record is delivered while forged-1 stays withheld.
      // join-1 is verified, so the withheld copy cannot make the key
      // unavailable: reads serve the verified head.
      await expect(
        headCache.findByNetworkId('network-1'),
      ).resolves.toContainEqual({
        key: 'community:community-1',
        value: expect.objectContaining({
          communityOperations: [{ id: 'join-1' }],
        }),
      });
      await expect(registry.findHead('community:community-1')).resolves.toEqual(
        expect.objectContaining({ communityOperations: [{ id: 'join-1' }] }),
      );
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
      // Past the queue the network is overflowed: a key it dropped waits.
      await expect(registry.findHead('community:c-513')).rejects.toThrow(
        ReplicatedStateNotReadyError,
      );
      // A key nobody dropped or holds is not delayed by the overflow.
      await expect(
        registry.findHead('community:unseen'),
      ).resolves.toBeUndefined();
      await expect(
        registry.findPersistedHead('community:unseen'),
      ).resolves.toBeUndefined();
      expect(registry.hasPendingHeadAdmissions('community:')).toBe(true);

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

  describe('copies a peer plants under a held head key', () => {
    const setup = async (
      accepts: (record: Record<string, unknown>) => boolean,
    ): Promise<{
      network: ReturnType<typeof createStores>;
      registry: OrbitDBReplicatedStateRegistry;
    }> => {
      const gate = mock<OrbitDBMutationGate>();
      const registry = new OrbitDBReplicatedStateRegistry();
      const network = createStores();

      gate.governs.mockImplementation(
        (collection) => collection === 'communityOperations',
      );
      gate.governsHead.mockReturnValue(false);
      gate.verdictOf.mockImplementation((_collection, record) =>
        Promise.resolve(accepts(record) ? 'accepted' : 'pending'),
      );
      registry.addMutationGate(gate);
      await registry.register('network-1', network.stores);

      return { network, registry };
    };
    const emit = (
      network: ReturnType<typeof createStores>,
      key: string,
      operation: string,
      updatedAt: number,
      stored = false,
    ): void => {
      const value = {
        communityOperations: [{ id: operation }],
        id: key,
        updatedAt,
      };

      // A head the node keeps in its store survives a rescan of the network.
      if (stored) void network.heads.put(key, value);
      network.heads.emitUpdate({ payload: { key, value } });
    };

    it('never makes a subject with a verified head unavailable, whatever the copy claims (unknown parent, future revision or huge updatedAt)', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });

      try {
        const { network, registry } = await setup((record) =>
          String(record.id).startsWith('honest'),
        );

        emit(network, 'community:c-1', 'honest-1', 10, true);
        await jest.advanceTimersByTimeAsync(0);
        emit(network, 'community:c-1', 'planted-unknown-parent', 10 ** 15);
        emit(network, 'community:c-1', 'planted-future-revision', 11);
        await jest.advanceTimersByTimeAsync(0);

        expect(registry.hasPendingHeadAdmissions('community:')).toBe(false);
        await expect(registry.findHead('community:c-1')).resolves.toEqual(
          expect.objectContaining({
            communityOperations: [{ id: 'honest-1' }],
          }),
        );
        expect(registry.findCachedHead('community:c-1')).toBeDefined();

        // The honest chain converges past the planted copies: the kick lands.
        emit(network, 'community:c-1', 'honest-kick', 20);
        await jest.advanceTimersByTimeAsync(0);
        expect(
          JSON.stringify(await registry.findHead('community:c-1')),
        ).toContain('honest-kick');
        registry.clear();
      } finally {
        jest.useRealTimers();
      }
    });

    it('ends the hold of a copy that never proves out, so no peer keeps a key unavailable', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });

      try {
        const { network, registry } = await setup(() => false);

        emit(network, 'community:c-2', 'planted', 10 ** 15);
        await jest.advanceTimersByTimeAsync(60_000);

        // Nothing is verified for the key, so it waits (503020).
        await expect(registry.findHead('community:c-2')).rejects.toThrow(
          ReplicatedStateNotReadyError,
        );

        await jest.advanceTimersByTimeAsync(16 * 60_000);

        expect(registry.hasPendingHeadAdmissions('community:')).toBe(false);
        await expect(
          registry.findHead('community:c-2'),
        ).resolves.toBeUndefined();

        // The same copy is not held again.
        emit(network, 'community:c-2', 'planted', 10 ** 15);
        await jest.advanceTimersByTimeAsync(0);
        expect(registry.hasPendingHeadAdmissions('community:')).toBe(false);
        registry.clear();
      } finally {
        jest.useRealTimers();
      }
    });

    it('keeps an honest held copy when more than 8 junk copies arrive under its key', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });

      try {
        let honestProvesOut = false;
        const { network, registry } = await setup(
          (record) => honestProvesOut && record.id === 'honest',
        );

        emit(network, 'community:c-3', 'honest', 10, true);
        await jest.advanceTimersByTimeAsync(0);

        for (let junk = 0; junk < 20; junk += 1) {
          emit(network, 'community:c-3', `junk-${junk}`, 10 + junk);
        }
        await jest.advanceTimersByTimeAsync(0);

        honestProvesOut = true;
        await jest.advanceTimersByTimeAsync(2 * 60_000);

        await expect(registry.findHead('community:c-3')).resolves.toEqual(
          expect.objectContaining({
            communityOperations: [{ id: 'honest' }],
          }),
        );
        registry.clear();
      } finally {
        jest.useRealTimers();
      }
    });

    it('clears the overflow of a network once the held heads fit again, without waiting for it to drain', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });

      try {
        let provenUpTo = 0;
        const { network, registry } = await setup((record) => {
          const index = Number(String(record.id).replace('op-', ''));

          return index <= provenUpTo;
        });

        for (let index = 1; index <= 600; index += 1) {
          const value = {
            communityOperations: [{ id: `op-${index}` }],
            id: `c-${index}`,
            updatedAt: 10,
          };

          await network.heads.put(`community:c-${index}`, value);
          network.heads.emitUpdate({
            payload: { key: `community:c-${index}`, value },
          });
        }
        await jest.advanceTimersByTimeAsync(0);
        await expect(registry.findHead('community:c-530')).rejects.toThrow(
          ReplicatedStateNotReadyError,
        );

        // 560 of the 600 prove out; 40 stay held, below the 512 bound.
        provenUpTo = 560;
        await jest.advanceTimersByTimeAsync(10 * 60_000);

        for (
          let turn = 0;
          turn < 1_000 && registry.hasPendingHeadAdmissions('community:c-530');
          turn += 1
        ) {
          await new Promise((resolve) => setImmediate(resolve));
        }

        // c-530 was dropped for want of room; the rescan proved it out.
        expect(registry.hasPendingHeadAdmissions('community:c-530')).toBe(
          false,
        );
        await expect(registry.findHead('community:c-530')).resolves.toEqual(
          expect.objectContaining({ id: 'c-530' }),
        );
        await expect(
          registry.findHead('community:unseen'),
        ).resolves.toBeUndefined();
        registry.clear();
      } finally {
        jest.useRealTimers();
      }
    });

    it('never makes a read of a key nobody dropped wait because the network overflowed, and never in another network', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });

      try {
        const { network, registry } = await setup((record) =>
          String(record.id).startsWith('honest'),
        );
        const other = createStores();

        await registry.register('network-2', other.stores);
        emit(other, 'community:b-1', 'honest-b', 10, true);

        for (let index = 1; index <= 600; index += 1) {
          emit(network, `community:a-${index}`, `junk-${index}`, 10, true);
        }
        await jest.advanceTimersByTimeAsync(0);

        // Network 1 overflowed: a key it dropped waits.
        await expect(registry.findHead('community:a-600')).rejects.toThrow(
          ReplicatedStateNotReadyError,
        );
        // The verified head of network 2 and a key nobody holds do not.
        await expect(registry.findHead('community:b-1')).resolves.toEqual(
          expect.objectContaining({
            communityOperations: [{ id: 'honest-b' }],
          }),
        );
        await expect(
          registry.findHead('community:unseen'),
        ).resolves.toBeUndefined();
        await expect(
          registry.findPersistedHead('community:unseen'),
        ).resolves.toBeUndefined();
        expect(registry.hasPendingHeadAdmissions('community-b:')).toBe(false);
        registry.clear();
      } finally {
        jest.useRealTimers();
      }
    });

    it('does not renew the hold of a key that expired unverified when fresh copies keep arriving, and gives up on it for good after three expiries', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });

      try {
        const { network, registry } = await setup(() => false);

        emit(network, 'community:c-3', 'planted-0', 10 ** 15);
        await jest.advanceTimersByTimeAsync(16 * 60_000);
        expect(registry.hasPendingHeadAdmissions('community:')).toBe(false);

        // A fresh digest every 5 minutes for 14 minutes after the expiry.
        for (let fresh = 1; fresh <= 2; fresh += 1) {
          emit(network, 'community:c-3', `planted-${fresh}`, 10 ** 15);
          await jest.advanceTimersByTimeAsync(5 * 60_000);
          expect(registry.hasPendingHeadAdmissions('community:')).toBe(false);
        }
        await expect(
          registry.findHead('community:c-3'),
        ).resolves.toBeUndefined();

        // After the cool-down the key is held again, and expires again.
        await jest.advanceTimersByTimeAsync(6 * 60_000);
        emit(network, 'community:c-3', 'planted-3', 10 ** 15);
        await jest.advanceTimersByTimeAsync(0);
        expect(registry.hasPendingHeadAdmissions('community:')).toBe(true);
        await jest.advanceTimersByTimeAsync(16 * 60_000);
        await jest.advanceTimersByTimeAsync(16 * 60_000);
        emit(network, 'community:c-3', 'planted-4', 10 ** 15);
        await jest.advanceTimersByTimeAsync(0);
        expect(registry.hasPendingHeadAdmissions('community:')).toBe(true);
        await jest.advanceTimersByTimeAsync(16 * 60_000);

        // Three expiries: no fresh copy holds the key again.
        await jest.advanceTimersByTimeAsync(60 * 60_000);
        emit(network, 'community:c-3', 'planted-5', 10 ** 15);
        await jest.advanceTimersByTimeAsync(0);
        expect(registry.hasPendingHeadAdmissions('community:')).toBe(false);
        await expect(
          registry.findHead('community:c-3'),
        ).resolves.toBeUndefined();
        registry.clear();
      } finally {
        jest.useRealTimers();
      }
    });

    it('never makes the list wait on a key a peer planted, only on a head this node restored from its own cache', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });

      try {
        const { network, registry } = await setup(() => false);

        emit(network, 'community:random-planted', 'planted', 10 ** 15);
        await jest.advanceTimersByTimeAsync(0);

        // The read of the planted key waits; the list of known state does not.
        expect(registry.hasPendingHeadAdmissions('community:')).toBe(true);
        expect(registry.hasPendingRestoredHeadAdmissions('community:')).toBe(
          false,
        );
        registry.clear();
      } finally {
        jest.useRealTimers();
      }
    });

    it('keeps the list waiting on an own head restored at start that its gate has not admitted yet', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });

      try {
        const headCache = new InMemoryOrbitDBReplicatedHeadCache();
        const registry =
          OrbitDBReplicatedStateRegistry.withHeadCache(headCache);
        const { heads, stores } = createStores();
        const gate = mock<OrbitDBMutationGate>();
        let admitted = false;

        gate.governs.mockImplementation(
          (collection) => collection === 'communityOperations',
        );
        gate.governsHead.mockReturnValue(false);
        gate.verdictOf.mockImplementation(() =>
          Promise.resolve(admitted ? 'accepted' : 'pending'),
        );
        await headCache.save('network-1', 'community:own', {
          communityOperations: [{ id: 'own-1' }],
          id: 'own',
          updatedAt: 10,
        });
        await headCache.markWarm('network-1', JSON.stringify(['head-1']));
        heads.log = { heads: jest.fn(async () => [{ hash: 'head-1' }]) };
        registry.addMutationGate(gate);
        await registry.register('network-1', stores);

        expect(registry.hasPendingRestoredHeadAdmissions('community:')).toBe(
          true,
        );

        admitted = true;
        await jest.advanceTimersByTimeAsync(5_000);

        expect(registry.hasPendingRestoredHeadAdmissions('community:')).toBe(
          false,
        );
        registry.clear();
      } finally {
        jest.useRealTimers();
      }
    });

    it('keeps waiting on an own head restored at start when a trivial, empty or refused head is offered under its key, in its network or in another', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });

      try {
        const headCache = new InMemoryOrbitDBReplicatedHeadCache();
        const registry =
          OrbitDBReplicatedStateRegistry.withHeadCache(headCache);
        const network = createStores();
        const other = createStores();
        const gate = mock<OrbitDBMutationGate>();

        gate.governs.mockImplementation(
          (collection) => collection === 'communityOperations',
        );
        gate.governsHead.mockReturnValue(false);
        gate.verdictOf.mockImplementation((_collection, record) =>
          Promise.resolve(
            String(record.id).startsWith('refused') ? 'refused' : 'pending',
          ),
        );
        await headCache.save('network-1', 'community:own', {
          communityOperations: [{ id: 'own-1' }],
          id: 'own',
          updatedAt: 10,
        });
        await headCache.markWarm('network-1', JSON.stringify(['head-1']));
        network.heads.log = {
          heads: jest.fn(async () => [{ hash: 'head-1' }]),
        };
        registry.addMutationGate(gate);
        await registry.register('network-1', network.stores);
        await registry.register('network-2', other.stores);

        const offer = (
          stores: ReturnType<typeof createStores>,
          value: Record<string, unknown>,
        ): void =>
          stores.heads.emitUpdate({ payload: { key: 'community:own', value } });

        // Trivial: no gated list at all, and a revision far past the own copy.
        offer(network, { id: 'own', updatedAt: 10 ** 15 });
        offer(other, { id: 'own', updatedAt: 10 ** 15 });
        // Empty gated list.
        offer(network, {
          communityOperations: [],
          id: 'own',
          updatedAt: 10 ** 15 + 1,
        });
        offer(other, {
          communityOperations: [],
          id: 'own',
          updatedAt: 10 ** 15 + 1,
        });
        // Refused.
        offer(network, {
          communityOperations: [{ id: 'refused-1' }],
          id: 'own',
          updatedAt: 10 ** 15 + 2,
        });
        offer(other, {
          communityOperations: [{ id: 'refused-2' }],
          id: 'own',
          updatedAt: 10 ** 15 + 2,
        });
        await jest.advanceTimersByTimeAsync(0);

        expect(registry.hasPendingRestoredHeadAdmissions('community:')).toBe(
          true,
        );
        await expect(registry.findHead('community:own')).rejects.toBeInstanceOf(
          ReplicatedStateNotReadyError,
        );
        expect(registry.findCachedHeadsByPrefix('community:')).toEqual([]);
        registry.clear();
      } finally {
        jest.useRealTimers();
      }
    });

    it('bounds the verified keys of a network, and never evicts a key restored from the own cache', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });

      try {
        const headCache = new InMemoryOrbitDBReplicatedHeadCache();
        const registry =
          OrbitDBReplicatedStateRegistry.withHeadCache(headCache);
        const network = createStores();
        const gate = mock<OrbitDBMutationGate>();

        gate.governs.mockImplementation(
          (collection) => collection === 'communityOperations',
        );
        gate.governsHead.mockReturnValue(false);
        gate.verdictOf.mockImplementation((_collection, record) =>
          Promise.resolve(
            String(record.id).startsWith('planted') ? 'pending' : 'accepted',
          ),
        );
        await headCache.save('network-1', 'community:own', {
          communityOperations: [{ id: 'own-1' }],
          id: 'own',
          updatedAt: 10,
        });
        await headCache.markWarm('network-1', JSON.stringify(['head-1']));
        network.heads.log = {
          heads: jest.fn(async () => [{ hash: 'head-1' }]),
        };
        registry.addMutationGate(gate);
        await registry.register('network-1', network.stores);

        // Far past the bound of verified keys a network keeps.
        for (let index = 1; index <= 8_400; index += 1) {
          emit(network, `community:flood-${index}`, `honest-${index}`, 10);
        }
        await jest.advanceTimersByTimeAsync(0);

        emit(network, 'community:own', 'planted-own', 11);
        emit(network, 'community:flood-1', 'planted-flood', 11);
        await jest.advanceTimersByTimeAsync(0);

        // The restored key kept its verification: a planted copy gates nothing.
        await expect(registry.findHead('community:own')).resolves.toBeDefined();
        // The oldest flooded key was evicted: the planted copy holds it.
        await expect(
          registry.findHead('community:flood-1'),
        ).rejects.toBeInstanceOf(ReplicatedStateNotReadyError);
        registry.clear();
      } finally {
        jest.useRealTimers();
      }
    });

    it('forgets what a network settled and restored once it is unregistered', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });

      try {
        const { network, registry } = await setup((record) =>
          String(record.id).startsWith('honest'),
        );

        emit(network, 'community:c-1', 'honest-1', 10);
        await jest.advanceTimersByTimeAsync(0);
        await expect(registry.findHead('community:c-1')).resolves.toBeDefined();

        await registry.unregister('network-1');
        await registry.register('network-1', network.stores);
        emit(network, 'community:c-1', 'planted-1', 11);
        await jest.advanceTimersByTimeAsync(0);

        // Nothing settled survives the unregister, so the planted copy holds.
        await expect(registry.findHead('community:c-1')).rejects.toBeInstanceOf(
          ReplicatedStateNotReadyError,
        );
        registry.clear();
      } finally {
        jest.useRealTimers();
      }
    });

    it('serves the list however many distinct keys a peer plants, keeps waiting on the own unverified head, leaves other networks alone and recovers once the junk drains', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });

      try {
        const headCache = new InMemoryOrbitDBReplicatedHeadCache();
        const registry =
          OrbitDBReplicatedStateRegistry.withHeadCache(headCache);
        const network = createStores();
        const other = createStores();
        const gate = mock<OrbitDBMutationGate>();
        let ownAdmitted = false;
        let junkAdmitted = false;

        gate.governs.mockImplementation(
          (collection) => collection === 'communityOperations',
        );
        gate.governsHead.mockReturnValue(false);
        gate.verdictOf.mockImplementation((_collection, record) => {
          const id = String(record.id);

          if (id.startsWith('honest')) return Promise.resolve('accepted');

          return Promise.resolve(
            (id === 'own-1' ? ownAdmitted : junkAdmitted)
              ? 'accepted'
              : 'pending',
          );
        });
        await headCache.save('network-1', 'community:own', {
          communityOperations: [{ id: 'own-1' }],
          id: 'own',
          updatedAt: 10,
        });
        await headCache.markWarm('network-1', JSON.stringify(['head-1']));
        network.heads.log = {
          heads: jest.fn(async () => [{ hash: 'head-1' }]),
        };
        registry.addMutationGate(gate);
        await registry.register('network-1', network.stores);
        await registry.register('network-2', other.stores);
        emit(other, 'community:b-1', 'honest-b', 10, true);

        // 2.5k distinct keys: past every bound the registry keeps.
        for (let index = 1; index <= 2_500; index += 1) {
          emit(
            network,
            `community:planted-${index}`,
            `junk-${index}`,
            10,
            true,
          );
        }
        await jest.advanceTimersByTimeAsync(0);

        // The own head this node restored is not admitted: the list waits.
        expect(registry.hasPendingRestoredHeadAdmissions('community:')).toBe(
          true,
        );

        // Once it is admitted the planted flood gates the list no more.
        ownAdmitted = true;
        await jest.advanceTimersByTimeAsync(5_000);
        expect(registry.hasPendingRestoredHeadAdmissions('community:')).toBe(
          false,
        );

        // Other networks and unseen keys read as usual, in the flood.
        await expect(registry.findHead('community:b-1')).resolves.toEqual(
          expect.objectContaining({
            communityOperations: [{ id: 'honest-b' }],
          }),
        );
        await expect(
          registry.findHead('community:unseen'),
        ).resolves.toBeUndefined();

        // A key past the bound is not remembered: it waits for nothing.
        await expect(
          registry.findHead('community:planted-2500'),
        ).resolves.toBeUndefined();

        // The flood proves out: held heads drain and the network recovers.
        junkAdmitted = true;
        await jest.advanceTimersByTimeAsync(10 * 60_000);

        // The rescan yields between batches of heads on the event loop.
        for (
          let turn = 0;
          turn < 5_000 && registry.hasPendingHeadAdmissions('community:');
          turn += 1
        ) {
          await jest.advanceTimersByTimeAsync(60_000);
        }
        await expect(
          registry.findHead('community:planted-1'),
        ).resolves.toBeDefined();
        expect(registry.hasPendingHeadAdmissions('community:')).toBe(false);
        registry.clear();
      } finally {
        jest.useRealTimers();
      }
    });

    it('keeps the cool-down of a key to the network it expired in', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });

      try {
        const { network, registry } = await setup(() => false);
        const other = createStores();

        await registry.register('network-2', other.stores);
        emit(network, 'community:c-4', 'planted-0', 10 ** 15);
        await jest.advanceTimersByTimeAsync(16 * 60_000);
        expect(registry.hasPendingHeadAdmissions('community:')).toBe(false);

        // Cooling down in network 1; the same key in network 2 is held.
        emit(network, 'community:c-4', 'planted-1', 10 ** 15);
        await jest.advanceTimersByTimeAsync(0);
        expect(registry.hasPendingHeadAdmissions('community:')).toBe(false);
        emit(other, 'community:c-4', 'planted-2', 10 ** 15);
        await jest.advanceTimersByTimeAsync(0);
        expect(registry.hasPendingHeadAdmissions('community:')).toBe(true);
        registry.clear();
      } finally {
        jest.useRealTimers();
      }
    });

    it('reads a key by the key alone: a copy held under it in any network makes the read wait until a head of that key is settled, in any network', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });

      try {
        const { network, registry } = await setup((record) =>
          String(record.id).startsWith('honest'),
        );
        const other = createStores();

        await registry.register('network-2', other.stores);
        emit(other, 'community:same', 'junk-b', 10);
        await jest.advanceTimersByTimeAsync(0);

        // Held in network 2 only: a read of the key waits, whichever
        // network the caller means. Reads take no network.
        await expect(registry.findHead('community:same')).rejects.toThrow(
          ReplicatedStateNotReadyError,
        );

        // A head of the key settled in network 1 ends the wait for the
        // copy network 2 holds: verified keys are global by key.
        emit(network, 'community:same', 'honest-a', 10);
        await jest.advanceTimersByTimeAsync(0);
        await expect(registry.findHead('community:same')).resolves.toEqual(
          expect.objectContaining({
            communityOperations: [{ id: 'honest-a' }],
          }),
        );
        registry.clear();
      } finally {
        jest.useRealTimers();
      }
    });

    it('never makes a key with a verified head wait for a copy another network holds under the same key', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });

      try {
        const { network, registry } = await setup((record) =>
          String(record.id).startsWith('honest'),
        );
        const other = createStores();

        await registry.register('network-2', other.stores);
        emit(network, 'community:same', 'honest-a', 10);
        await jest.advanceTimersByTimeAsync(0);
        emit(other, 'community:same', 'junk-b', 20);
        await jest.advanceTimersByTimeAsync(0);

        await expect(registry.findHead('community:same')).resolves.toEqual(
          expect.objectContaining({
            communityOperations: [{ id: 'honest-a' }],
          }),
        );
        registry.clear();
      } finally {
        jest.useRealTimers();
      }
    });

    it('answers 503020 on a read of a restored head the network dropped for lack of room, and on the list', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });

      try {
        const headCache = new InMemoryOrbitDBReplicatedHeadCache();
        const registry =
          OrbitDBReplicatedStateRegistry.withHeadCache(headCache);
        const { heads, stores } = createStores();
        const gate = mock<OrbitDBMutationGate>();

        gate.governs.mockImplementation(
          (collection) => collection === 'communityOperations',
        );
        gate.governsHead.mockReturnValue(false);
        gate.verdictOf.mockResolvedValue('pending');
        // More restored heads than the network holds (256 active + 256 queued).
        for (let index = 1; index <= 600; index += 1) {
          await headCache.save('network-1', `community:own-${index}`, {
            communityOperations: [{ id: `own-${index}` }],
            id: `own-${index}`,
            updatedAt: 10,
          });
        }
        await headCache.markWarm('network-1', JSON.stringify(['head-1']));
        heads.log = { heads: jest.fn(async () => [{ hash: 'head-1' }]) };
        registry.addMutationGate(gate);
        await registry.register('network-1', stores);
        await jest.advanceTimersByTimeAsync(0);

        await expect(registry.findHead('community:own-600')).rejects.toThrow(
          ReplicatedStateNotReadyError,
        );
        expect(registry.hasPendingRestoredHeadAdmissions('community:')).toBe(
          true,
        );
        registry.clear();
      } finally {
        jest.useRealTimers();
      }
    });
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

        // The head is re-armed every 60 s while it is held; the hold ends
        // when the copy expires (15 min), so no timer outlives it.
        for (let second = 0; second < 7_200; second += 5) {
          await jest.advanceTimersByTimeAsync(5_000);
          peak = Math.max(peak, jest.getTimerCount());
        }

        expect(registry.hasPendingHeadAdmissions('community:')).toBe(false);
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
