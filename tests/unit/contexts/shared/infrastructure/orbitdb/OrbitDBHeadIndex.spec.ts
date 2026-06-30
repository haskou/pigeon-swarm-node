import OrbitDBHeadIndex from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBHeadIndex';
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

  it('preserves persisted records when background merging without a cached head', async () => {
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

    HttpRequestContext.run(request, () =>
      index.replicateRecordInBackground(
        'index:key',
        {
          id: 'index:key',
          ownerId: 'owner',
        },
        document('second', 2),
        [networkId],
      ),
    );
    await flushBackgroundTasks();

    await expect(heads.get('index:key')).resolves.toEqual({
      id: 'index:key',
      items: [document('first', 1), document('second', 2)],
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
  return new Promise((resolve) => setImmediate(resolve));
}
