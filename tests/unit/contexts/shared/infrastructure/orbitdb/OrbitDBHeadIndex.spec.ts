import { OrbitDBHeadIndex } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBHeadIndex';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import HttpRequestContext from '@app/shared/infrastructure/express/HttpRequestContext';
import { Request } from 'express';

type Entry = {
  key?: string;
  value: Record<string, unknown>;
};

type TestDocument = Record<string, unknown> & {
  id: string;
  networkId?: string;
  secondaryId?: string;
  updatedAt: number;
  value: string;
};

function createStore(): {
  all: jest.Mock<Promise<Entry[]>>;
  get: jest.Mock<Promise<Record<string, unknown> | undefined>, [string]>;
  put: jest.Mock<Promise<string>, [string, Record<string, unknown>]>;
} {
  const entries = new Map<string, Record<string, unknown>>();

  return {
    all: jest.fn(async () =>
      [...entries.entries()].map(([key, value]) => ({ key, value })),
    ),
    get: jest.fn(async (key: string) => entries.get(key)),
    put: jest.fn(async (key: string, value: Record<string, unknown>) => {
      entries.set(key, value);

      return key;
    }),
  };
}

describe('OrbitDBHeadIndex', () => {
  const networkId = 'network-1';
  let heads: ReturnType<typeof createStore>;
  let registry: OrbitDBReplicatedStateRegistry;
  let index: OrbitDBHeadIndex<TestDocument>;

  function document(
    id: string,
    updatedAt: number,
    value = id,
    secondaryId?: string,
  ): TestDocument {
    return {
      id,
      networkId,
      secondaryId,
      updatedAt,
      value,
    };
  }

  beforeEach(() => {
    heads = createStore();
    registry = new OrbitDBReplicatedStateRegistry();
    registry.register(networkId, {
      heads,
    } as never);
    index = new OrbitDBHeadIndex(registry, {
      collectionName: 'items',
      documentFromRecord: (record) =>
        typeof record.id === 'string' &&
        typeof record.updatedAt === 'number' &&
        typeof record.value === 'string'
          ? (record as TestDocument)
          : undefined,
      documentIds: (item) => [item.id, item.secondaryId].filter(Boolean),
      recordId: (record) =>
        typeof record.id === 'string' ? record.id : undefined,
      shouldReplace: (current, candidate) =>
        current.updatedAt <= candidate.updatedAt,
    });
  });

  afterEach(() => {
    registry.clear();
  });

  it('reads valid records from a head collection', () => {
    const head = {
      id: 'index',
      items: [
        document('first', 1),
        { id: 'invalid' },
        'not-a-record',
        document('second', 2),
      ],
    };

    expect(index.recordsFromHead(head)).toHaveLength(3);
    expect(index.documentsFromHead(head)).toEqual([
      document('first', 1),
      document('second', 2),
    ]);
    expect(index.documentsFromHead(undefined)).toBeUndefined();
  });

  it('deduplicates documents using the configured replacement policy', () => {
    expect(
      index.deduplicate([
        document('same', 1, 'older'),
        document('same', 3, 'newer'),
        document('same', 2, 'stale'),
        document('other', 1),
      ]),
    ).toEqual([document('same', 3, 'newer'), document('other', 1)]);
  });

  it('merges raw records by record id', () => {
    expect(
      index.mergeRecords(
        [document('same', 1, 'older'), document('other', 1)],
        document('same', 2, 'newer'),
      ),
    ).toEqual([document('same', 2, 'newer'), document('other', 1)]);
  });

  it('keeps the freshest raw record when merging an older record later', () => {
    expect(
      index.mergeRecords(
        [
          {
            ...document('same', 1, 'deleted'),
            deleted: true,
            deletedAt: 3,
          },
        ],
        document('same', 1, 'older'),
      ),
    ).toEqual([
      {
        ...document('same', 1, 'deleted'),
        deleted: true,
        deletedAt: 3,
      },
    ]);
  });

  it('stores deduplicated documents with metadata and network routing', async () => {
    await index.putDocuments(
      'index:key',
      {
        id: 'index:key',
        ownerId: 'owner',
      },
      [
        document('same', 1, 'older'),
        document('same', 2, 'newer'),
        document('skipped', 3, 'skip'),
      ],
      {
        filter: (item) => item.value !== 'skip',
        networkIds: [networkId],
      },
    );

    await expect(heads.get('index:key')).resolves.toEqual({
      id: 'index:key',
      items: [document('same', 2, 'newer')],
      ownerId: 'owner',
      updatedAt: expect.any(Number),
    });
  });

  it('persists only live documents in an exact replacement', async () => {
    await index.putDocuments(
      'index:key',
      { id: 'index:key' },
      [document('retained', 1), document('removed', 1)],
      { networkIds: [networkId] },
    );

    await index.putDocuments(
      'index:key',
      { id: 'index:key' },
      [document('retained', 2)],
      { networkIds: [networkId], replace: true },
    );

    await expect(heads.get('index:key')).resolves.toEqual({
      id: 'index:key',
      items: [document('retained', 2)],
      updatedAt: expect.any(Number),
    });
    await expect(index.find('index:key')).resolves.toEqual([
      document('retained', 2),
    ]);
  });

  it('persists an empty exact replacement when a record leaves its index', async () => {
    await index.putRecord(
      'index:key',
      { id: 'index:key' },
      document('removed', 1, 'included'),
      [networkId],
    );

    await index.putRecord(
      'index:key',
      { id: 'index:key' },
      document('removed', 2, 'excluded'),
      [networkId],
      { recordFilter: (record) => record.value !== 'excluded', replace: true },
    );

    await expect(heads.get('index:key')).resolves.toEqual({
      id: 'index:key',
      items: [],
      updatedAt: expect.any(Number),
    });
    await expect(index.find('index:key')).resolves.toEqual([]);
  });

  it('does not let an untrusted tombstone replace a valid record', () => {
    const stored = document('same', 1, 'stored');

    expect(
      index.mergeRecords([stored], {
        id: 'same',
        removed: true,
        updatedAt: Number.MAX_SAFE_INTEGER,
      }),
    ).toEqual([stored]);
  });

  it('derives removals from the canonical store on receiving replicas', async () => {
    jest
      .spyOn(registry, 'onDocumentUpdated')
      .mockImplementation(async (_storeName, listener) => {
        await listener({
          ...document('removed', 1),
          scopeId: 'scope-1',
        });
        await listener({
          ...document('removed', 2),
          removed: true,
          scopeId: 'scope-1',
        });
      });
    const canonicalIndex = new OrbitDBHeadIndex(registry, {
      canonicalIndexKeys: (record) => [`index:${String(record.scopeId)}`],
      canonicalStoreName: 'pins',
      collectionName: 'items',
      documentFromRecord: (record) =>
        record.removed !== true &&
        typeof record.id === 'string' &&
        typeof record.updatedAt === 'number' &&
        typeof record.value === 'string'
          ? (record as TestDocument)
          : undefined,
      recordId: (record) =>
        typeof record.id === 'string' ? record.id : undefined,
      shouldReplace: (current, candidate) =>
        current.updatedAt <= candidate.updatedAt,
    });
    registry.cacheHeadLocally('index:scope-1', {
      id: 'index:scope-1',
      items: [document('removed', 1)],
      updatedAt: 1,
    });
    const queryDocuments = jest.spyOn(registry, 'queryDocuments');

    await expect(canonicalIndex.find('index:scope-1')).resolves.toEqual([]);
    await expect(canonicalIndex.find('index:scope-1')).resolves.toEqual([]);
    expect(queryDocuments).not.toHaveBeenCalled();
  });

  it('bounds exact replacement storage by the live record set', async () => {
    await index.putDocuments(
      'index:key',
      { id: 'index:key' },
      Array.from({ length: 100 }, (_, position) =>
        document(`removed-${position}`, position),
      ),
      { networkIds: [networkId], replace: true },
    );

    await index.putDocuments(
      'index:key',
      { id: 'index:key' },
      [document('retained', 101)],
      { networkIds: [networkId], replace: true },
    );

    await expect(heads.get('index:key')).resolves.toEqual({
      id: 'index:key',
      items: [document('retained', 101)],
      updatedAt: expect.any(Number),
    });
  });

  it('admits later canonical records without resurrecting removed records', async () => {
    jest
      .spyOn(registry, 'onDocumentUpdated')
      .mockImplementation(async (_storeName, listener) => {
        await listener(document('retained', 2));
        await listener(document('replicated-later', 3));
      });
    const canonicalIndex = new OrbitDBHeadIndex(registry, {
      canonicalIndexKeys: () => ['index:key'],
      canonicalStoreName: 'pins',
      collectionName: 'items',
      documentFromRecord: (record) =>
        typeof record.id === 'string' &&
        typeof record.updatedAt === 'number' &&
        typeof record.value === 'string'
          ? (record as TestDocument)
          : undefined,
      recordId: (record) =>
        typeof record.id === 'string' ? record.id : undefined,
      shouldReplace: (current, candidate) =>
        current.updatedAt <= candidate.updatedAt,
    });
    registry.cacheHeadLocally('index:key', {
      id: 'index:key',
      items: [
        document('retained', 2),
        document('removed', 1),
        document('replicated-later', 3),
      ],
      updatedAt: Number.MAX_SAFE_INTEGER,
    });
    await expect(canonicalIndex.find('index:key')).resolves.toEqual([
      document('retained', 2),
      document('replicated-later', 3),
    ]);
  });

  it('rebuilds each canonical key once after the registered networks change', async () => {
    jest
      .spyOn(registry, 'onDocumentUpdated')
      .mockImplementation(async (_storeName, listener) => {
        await listener(document('before-reconfiguration', 1));
      });
    const keys = (record: Record<string, unknown>): string[] =>
      record.id === 'second-key' ? ['index:other'] : ['index:key'];
    const canonicalIndex = new OrbitDBHeadIndex(registry, {
      canonicalIndexKeys: keys,
      canonicalStoreName: 'pins',
      collectionName: 'items',
      documentFromRecord: (record) =>
        typeof record.id === 'string' &&
        typeof record.updatedAt === 'number' &&
        typeof record.value === 'string'
          ? (record as TestDocument)
          : undefined,
      recordId: (record) =>
        typeof record.id === 'string' ? record.id : undefined,
    });
    const queryDocuments = jest
      .spyOn(registry, 'queryDocuments')
      .mockImplementation(async (_storeName, predicate) =>
        [
          document('after-reconfiguration', 2),
          document('second-key', 3),
        ].filter(predicate),
      );

    await registry.register('network-2', { heads: createStore() } as never);

    await expect(canonicalIndex.find('index:key')).resolves.toEqual([
      document('after-reconfiguration', 2),
    ]);
    await expect(canonicalIndex.find('index:key')).resolves.toEqual([
      document('after-reconfiguration', 2),
    ]);
    await expect(canonicalIndex.find('index:other')).resolves.toEqual([
      document('second-key', 3),
    ]);
    await expect(canonicalIndex.find('index:other')).resolves.toEqual([
      document('second-key', 3),
    ]);
    expect(queryDocuments).toHaveBeenCalledTimes(2);
  });

  it('keeps the durable exact projection when its replacement fails', async () => {
    await index.putDocuments(
      'index:key',
      { id: 'index:key' },
      [document('durable', 1)],
      { networkIds: [networkId], replace: true },
    );
    heads.put.mockRejectedValueOnce(new Error('persistence failed'));

    await expect(
      index.putDocuments(
        'index:key',
        { id: 'index:key' },
        [document('rejected', 2)],
        { networkIds: [networkId], replace: true },
      ),
    ).rejects.toThrow('persistence failed');

    await expect(index.find('index:key')).resolves.toEqual([
      document('durable', 1),
    ]);
  });

  it('updates an available cached head while a background record merge is queued', async () => {
    index.replicateRecordInBackground(
      'index:key',
      {
        id: 'index:key',
        ownerId: 'owner',
      },
      document('queued', 1),
      [networkId],
    );
    registry.cacheHeadLocally('index:key', {
      id: 'index:key',
      items: [document('first', 1)],
      ownerId: 'owner',
      updatedAt: 1,
    });

    index.replicateRecordInBackground(
      'index:key',
      {
        id: 'index:key',
        ownerId: 'owner',
      },
      document('second', 2),
      [networkId],
    );

    expect(registry.findCachedHead('index:key')).toEqual({
      id: 'index:key',
      items: [document('first', 1), document('second', 2)],
      ownerId: 'owner',
      updatedAt: expect.any(Number),
    });

    await flushBackgroundTasks();

    const persistedHead = await heads.get('index:key');

    expect(persistedHead).toEqual(
      expect.objectContaining({
        id: 'index:key',
        ownerId: 'owner',
        updatedAt: expect.any(Number),
      }),
    );
    expect(persistedHead?.items).toEqual(
      expect.arrayContaining([
        document('first', 1),
        document('queued', 1),
        document('second', 2),
      ]),
    );
    expect(persistedHead?.items).toHaveLength(3);
  });

  it('shares local pending record overlays across index instances', async () => {
    const otherIndex = new OrbitDBHeadIndex<TestDocument>(registry, {
      collectionName: 'items',
      documentFromRecord: (record) =>
        typeof record.id === 'string' &&
        typeof record.updatedAt === 'number' &&
        typeof record.value === 'string'
          ? (record as TestDocument)
          : undefined,
      documentIds: (item) => [item.id, item.secondaryId].filter(Boolean),
      recordId: (record) =>
        typeof record.id === 'string' ? record.id : undefined,
      shouldReplace: (current, candidate) =>
        current.updatedAt <= candidate.updatedAt,
    });

    index.replicateRecordInBackground(
      'index:key',
      {
        id: 'index:key',
        ownerId: 'owner',
      },
      document('queued', 1),
      [networkId],
    );

    expect(registry.findCachedHead('index:key')).toBeUndefined();
    await expect(otherIndex.find('index:key')).resolves.toEqual([
      document('queued', 1),
    ]);
  });

  it('does not expose partial heads before merging a cold cache with persisted records', async () => {
    const request = {
      method: 'POST',
      originalUrl: '/messages',
      path: '/messages',
      url: '/messages',
    } as Request;

    await heads.put('index:key', {
      id: 'index:key',
      items: [document('first', 1)],
      ownerId: 'owner',
      updatedAt: 1,
    });

    expect(registry.findCachedHead('index:key')).toBeUndefined();

    HttpRequestContext.run(request, () => {
      index.replicateRecordInBackground(
        'index:key',
        {
          id: 'index:key',
          ownerId: 'owner',
        },
        document('second', 2),
        [networkId],
      );
      index.replicateRecordInBackground(
        'index:key',
        {
          id: 'index:key',
          ownerId: 'owner',
        },
        document('third', 3),
        [networkId],
      );
    });
    expect(registry.findCachedHead('index:key')).toBeUndefined();
    await HttpRequestContext.run(request, async () => {
      await expect(index.find('index:key')).resolves.toEqual([
        document('first', 1),
        document('second', 2),
        document('third', 3),
      ]);
    });
    const cachedHead = registry.findCachedHead('index:key');

    if (cachedHead) {
      expect(cachedHead.items).toEqual(
        expect.arrayContaining([document('first', 1)]),
      );
    }
    await flushBackgroundTasks();

    await expect(heads.get('index:key')).resolves.toEqual({
      id: 'index:key',
      items: [
        document('first', 1),
        document('second', 2),
        document('third', 3),
      ],
      ownerId: 'owner',
      updatedAt: expect.any(Number),
    });
  });

  it('returns every configured document id', () => {
    expect(
      index.documentIds([document('primary', 1, 'value', 'secondary')]),
    ).toEqual(new Set(['primary', 'secondary']));
  });
});

function flushBackgroundTasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve)).then(
    () => new Promise((resolve) => setImmediate(resolve)),
  );
}
