import { Profile } from '@app/contexts/identities/domain/Profile';
import { IdentityExternalIdentifier } from '@app/contexts/identities/domain/value-objects/IdentityExternalIdentifier';
import { IdentityVersion } from '@app/contexts/identities/domain/value-objects/IdentityVersion';
import { ProfileHandle } from '@app/contexts/identities/domain/value-objects/ProfileHandle';
import { ProfileName } from '@app/contexts/identities/domain/value-objects/ProfileName';
import OrbitDBIdentityMetadataIndex from '@app/contexts/identities/infrastructure/orbitdb/OrbitDBIdentityMetadataIndex';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { IdentityMother } from '../../../../mothers/IdentityMother';

describe('OrbitDBIdentityMetadataIndex', () => {
  const documents: Record<string, unknown>[] = [];
  const heads = new Map<string, Record<string, unknown>>();
  let registry: OrbitDBReplicatedStateRegistry;
  let repository: OrbitDBIdentityMetadataIndex;

  beforeEach(async () => {
    documents.splice(0);
    heads.clear();
    registry = new OrbitDBReplicatedStateRegistry();
    registry.clear();
    await registry.register('network-1', identityStores(documents, heads));
    repository = new OrbitDBIdentityMetadataIndex(registry);
  });

  afterEach(() => {
    registry.clear();
  });

  it('should save and find latest identity metadata by network', async () => {
    const mother = new IdentityMother();
    const networkId = mother.networks[0];
    const identity = mother.withNetworks([networkId]).build();
    await registry.register(
      networkId.valueOf(),
      identityStores(documents, heads),
    );

    await repository.save(
      identity,
      new IdentityExternalIdentifier('bafyidentity2'),
    );

    const records = await repository.findLatestByNetworkId(networkId);

    expect(records).toEqual([
      expect.objectContaining({
        cid: 'bafyidentity2',
        identityId: mother.id.valueOf(),
        networkIds: [networkId.valueOf()],
        version: 1,
      }),
    ]);
    expect(records[0].identity?.toPrimitives()).toEqual(
      identity.toPrimitives(),
    );
  });

  it('should persist identity heads before their metadata document', async () => {
    const mother = new IdentityMother();
    const identity = mother.build();
    const networkId = mother.networks[0].valueOf();
    const delayedHead = deferred<string>();
    const stores = identityStores(documents, heads) as unknown as {
      heads: { put: jest.Mock };
    };

    registry.clear();
    await registry.register(networkId, stores as never);
    repository = new OrbitDBIdentityMetadataIndex(registry);
    stores.heads.put.mockImplementation(
      async (key: string, value: Record<string, unknown>) => {
        await delayedHead.promise;
        heads.set(key, value);

        return 'ok';
      },
    );

    const save = repository.save(
      identity,
      new IdentityExternalIdentifier('bafyidentity-fast-head'),
    );
    const result = await Promise.race([
      save.then(() => 'saved'),
      new Promise((resolve) => setTimeout(() => resolve('blocked'), 10)),
    ]);

    expect(result).toBe('blocked');
    expect(heads.get(`identity:${mother.id.valueOf()}`)).toBeUndefined();
    expect(documents).toEqual([]);
    await expect(repository.findByIdentityId(mother.id)).resolves.toEqual([
      expect.objectContaining({
        cid: 'bafyidentity-fast-head',
        identityId: mother.id.valueOf(),
      }),
    ]);

    delayedHead.resolve('ok');
    await save;

    expect(heads.get(`identity:${mother.id.valueOf()}`)).toEqual(
      expect.objectContaining({
        cid: 'bafyidentity-fast-head',
        identityId: mother.id.valueOf(),
      }),
    );
  });

  it('should tombstone identity metadata by external identifier', async () => {
    const mother = new IdentityMother();
    await repository.save(
      mother.build(),
      new IdentityExternalIdentifier('bafyidentity1'),
    );

    await repository.deleteByExternalIdentifier(
      new IdentityExternalIdentifier('bafyidentity1'),
    );

    const records = await repository.findLatestByNetworkId(
      new NetworkId('550e8400-e29b-41d4-a716-446655440000'),
    );

    expect(records).toEqual([]);
  });

  it('should tombstone persisted handle aliases when deleting identity metadata', async () => {
    const identityMother = new IdentityMother();
    const handle = new ProfileHandle('hasko');
    const identity = await identityMother
      .build()
      .updateProfile(
        new Profile(
          new ProfileName('Hasko'),
          undefined,
          undefined,
          undefined,
          handle,
        ),
        identityMother.password,
        new IdentityExternalIdentifier('bafypreviousidentity'),
      );
    const networkId = identityMother.networks[0];
    await registry.register(
      networkId.valueOf(),
      identityStores(documents, heads),
    );

    await repository.save(
      identity,
      new IdentityExternalIdentifier('bafyidentity-handle-delete'),
    );
    await registry.putHead(
      `identity-handle:${handle.valueOf()}`,
      heads.get(`identity:${identityMother.id.valueOf()}`) || {},
      [networkId.valueOf()],
    );

    await repository.deleteByExternalIdentifier(
      new IdentityExternalIdentifier('bafyidentity-handle-delete'),
    );

    expect(heads.get(`identity-handle:${handle.valueOf()}`)).toEqual(
      expect.objectContaining({ deleted: true }),
    );
    await expect(repository.findByHandle(handle)).resolves.toEqual([]);
  });

  it('should read identity metadata by identity id from the head index', async () => {
    const mother = new IdentityMother();
    const networkId = mother.networks[0];
    const identity = mother.build();

    await registry.register(
      networkId.valueOf(),
      identityStores(documents, heads),
    );

    await repository.save(
      identity,
      new IdentityExternalIdentifier('bafyidentity-head'),
    );
    documents.splice(0);

    const records = await repository.findByIdentityId(mother.id);

    expect(records).toEqual([
      expect.objectContaining({
        cid: 'bafyidentity-head',
        identityId: mother.id.valueOf(),
      }),
    ]);
  });

  it('should not scan stored identity records when identity id head exists', async () => {
    const mother = new IdentityMother();
    const networkId = mother.networks[0];
    const identityId = mother.id.valueOf();
    const stores = identityStores(documents, heads) as unknown as {
      identities: { query: jest.Mock };
    };

    await registry.register(networkId.valueOf(), stores as never);
    await registry.putHead(
      `identity:${identityId}`,
      {
        cid: 'bafyidentity-v1',
        id: identityId,
        identityId,
        networkIds: [networkId.valueOf()],
        receivedAt: 1,
        version: 1,
      },
      [networkId.valueOf()],
    );
    documents.push({
      cid: 'bafyidentity-v2',
      id: identityId,
      identityId,
      networkIds: [networkId.valueOf()],
      receivedAt: 2,
      version: 2,
    });

    const records = await repository.findByIdentityId(mother.id);

    expect(records[0]).toEqual(
      expect.objectContaining({
        cid: 'bafyidentity-v1',
        version: 1,
      }),
    );
    await flushBackgroundTasks();
    expect(heads.get(`identity:${identityId}`)).toEqual(
      expect.objectContaining({
        cid: 'bafyidentity-v1',
        version: 1,
      }),
    );
    expect(stores.identities.query).not.toHaveBeenCalled();
  });

  it('should not scan stored identity records when identity id head is missing', async () => {
    const mother = new IdentityMother();
    const networkId = mother.networks[0];
    const query = jest.fn(() =>
      Promise.reject(new Error('Identity id lookup should not scan stores')),
    );

    registry.clear();
    await registry.register(
      networkId.valueOf(),
      identityStoresWithIdentityQuery(new Map(), query),
    );
    repository = new OrbitDBIdentityMetadataIndex(registry);

    await expect(repository.findByIdentityId(mother.id)).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('should read identity metadata by handle from the head index', async () => {
    const handle = new ProfileHandle('hasko');
    const mother = new IdentityMother();
    const networkId = mother.networks[0];
    const identity = await mother
      .build()
      .updateProfile(
        new Profile(
          new ProfileName('Hasko'),
          undefined,
          undefined,
          undefined,
          handle,
        ),
        mother.password,
        new IdentityExternalIdentifier('bafypreviousidentity'),
      );

    await registry.register(
      networkId.valueOf(),
      identityStores(documents, heads),
    );

    await repository.save(
      identity,
      new IdentityExternalIdentifier('bafyidentity-handle-head'),
    );
    documents.splice(0);

    const records = await repository.findByHandle(handle);

    expect(records).toEqual([
      expect.objectContaining({
        cid: 'bafyidentity-handle-head',
        handle: handle.valueOf(),
      }),
    ]);
    expect(records[0].identity?.toPrimitives()).toEqual(
      identity.toPrimitives(),
    );
  });

  it('should not scan stored identity records when handle head exists', async () => {
    const handle = new ProfileHandle('hasko');
    const mother = new IdentityMother().withVersion(new IdentityVersion(2));
    const networkId = mother.networks[0];
    const identityId = mother.id.valueOf();
    const stores = identityStores(documents, heads) as unknown as {
      identities: { query: jest.Mock };
    };

    await registry.register(networkId.valueOf(), stores as never);
    await registry.putHead(
      `identity-handle:${handle.valueOf()}`,
      {
        cid: 'bafyidentity-handle-v1',
        handle: handle.valueOf(),
        id: identityId,
        identityId,
        networkIds: [networkId.valueOf()],
        receivedAt: 1,
        version: 1,
      },
      [networkId.valueOf()],
    );
    documents.push({
      cid: 'bafyidentity-handle-v2',
      handle: handle.valueOf(),
      id: identityId,
      identityId,
      networkIds: [networkId.valueOf()],
      receivedAt: 2,
      version: 2,
    });

    const records = await repository.findByHandle(handle);

    expect(records[0]).toEqual(
      expect.objectContaining({
        cid: 'bafyidentity-handle-v1',
        version: 1,
      }),
    );
    await flushBackgroundTasks();
    expect(heads.get(`identity-handle:${handle.valueOf()}`)).toEqual(
      expect.objectContaining({
        cid: 'bafyidentity-handle-v1',
        version: 1,
      }),
    );
    expect(stores.identities.query).not.toHaveBeenCalled();
  });

  it('should not scan stored identity records when handle head is missing', async () => {
    const query = jest.fn(() =>
      Promise.reject(new Error('Handle lookup should not scan stores')),
    );

    registry.clear();
    await registry.register(
      'network-lookup',
      identityStoresWithIdentityQuery(new Map(), query),
    );
    repository = new OrbitDBIdentityMetadataIndex(registry);

    await expect(
      repository.findByHandle(new ProfileHandle('202020')),
    ).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('should read persisted handle heads on cache misses', async () => {
    const mother = new IdentityMother();
    const identity = mother.build();
    const primitives = identity.toPrimitives();
    const query = jest.fn(
      (matcher: (document: Record<string, unknown>) => boolean) =>
        Promise.resolve(
          [
            {
              cid: 'bafyidentity-http-fallback',
              handle: 'hasko',
              id: 'bafyidentity-http-fallback',
              identityId: primitives.id,
              networkIds: primitives.networks,
              receivedAt: 1,
              version: primitives.version,
            },
          ].filter(matcher),
        ),
    );
    const cachedHeads = new Map<string, Record<string, unknown>>();

    cachedHeads.set('identity-handle:hasko', {
      cid: 'bafyidentity-http-head',
      handle: 'hasko',
      id: 'bafyidentity-http-head',
      identityId: primitives.id,
      networkIds: primitives.networks,
      receivedAt: 1,
      version: primitives.version,
    });

    registry.clear();
    await registry.register(
      'network-lookup',
      identityStoresWithIdentityQuery(cachedHeads, query),
    );
    repository = new OrbitDBIdentityMetadataIndex(registry);

    const records = await repository.findByHandle(new ProfileHandle('hasko'));

    expect(records).toEqual([
      expect.objectContaining({
        cid: 'bafyidentity-http-head',
        handle: 'hasko',
        identityId: primitives.id,
      }),
    ]);
    expect(query).not.toHaveBeenCalled();
  });

  it('should use cached identity records by handle without scanning stores', async () => {
    const query = jest.fn(() =>
      Promise.reject(new Error('HTTP identity lookup should not scan stores')),
    );
    const cachedHeads = new Map<string, Record<string, unknown>>();
    const mother = new IdentityMother();
    const identityId = mother.id.valueOf();

    cachedHeads.set(`identity:${identityId}`, {
      cid: 'bafyidentity-cached',
      handle: 'hasko',
      id: identityId,
      identityId,
      networkIds: [mother.networks[0].valueOf()],
      receivedAt: 1,
      version: 1,
    });
    registry.clear();
    await registry.register(
      'network-lookup',
      identityStoresWithIdentityQuery(cachedHeads, query),
    );
    repository = new OrbitDBIdentityMetadataIndex(registry);

    const records = await repository.findByHandle(new ProfileHandle('hasko'));

    expect(records).toEqual([
      expect.objectContaining({
        cid: 'bafyidentity-cached',
        handle: 'hasko',
        identityId,
      }),
    ]);
    await flushBackgroundTasks();
    expect(query).not.toHaveBeenCalled();
  });

  it('should ignore cached heads that are not identity metadata', async () => {
    const cachedHeads = new Map<string, Record<string, unknown>>();
    const mother = new IdentityMother();
    const identityId = mother.id.valueOf();

    cachedHeads.set('identity:bafyimage', {
      cid: 'bafyimage',
      contentType: 'image/png',
      id: 'bafyimage',
      networkIds: [mother.networks[0].valueOf()],
      receivedAt: 2,
      sizeBytes: 123,
      version: 1,
    });
    cachedHeads.set(`identity:${identityId}`, {
      cid: 'bafyidentity-cached',
      handle: 'hasko',
      id: identityId,
      identityId,
      networkIds: [mother.networks[0].valueOf()],
      receivedAt: 1,
      version: 1,
    });

    registry.clear();
    await registry.register(
      'network-lookup',
      identityStoresWithIdentityQuery(cachedHeads, jest.fn()),
    );
    repository = new OrbitDBIdentityMetadataIndex(registry);

    await expect(repository.findAll()).resolves.toEqual([
      expect.objectContaining({
        cid: 'bafyidentity-cached',
        identityId,
      }),
    ]);
  });

  it('should read projected identity heads without explicit identityId', async () => {
    const cachedHeads = new Map<string, Record<string, unknown>>();
    const mother = new IdentityMother();
    const identityId = mother.id.valueOf();

    cachedHeads.set(`identity:${identityId}`, {
      cid: 'bafyidentity-projected',
      handle: 'hasko',
      id: identityId,
      lastEventId: 'event-1',
      networkIds: [mother.networks[0].valueOf()],
      receivedAt: 1,
      version: 1,
    });

    registry.clear();
    await registry.register(
      'network-lookup',
      identityStoresWithIdentityQuery(cachedHeads, jest.fn()),
    );
    repository = new OrbitDBIdentityMetadataIndex(registry);

    await expect(repository.findAll()).resolves.toEqual([
      expect.objectContaining({
        cid: 'bafyidentity-projected',
        identityId,
      }),
    ]);
  });

  it('should read persisted identity id heads on cache misses', async () => {
    const mother = new IdentityMother();
    const identity = mother.build();
    const primitives = identity.toPrimitives();
    const query = jest.fn(
      (matcher: (document: Record<string, unknown>) => boolean) =>
        Promise.resolve(
          [
            {
              cid: 'bafyidentity-id-http-fallback',
              handle: primitives.profile.handle,
              id: 'bafyidentity-id-http-fallback',
              identity: primitives,
              identityId: primitives.id,
              networkIds: primitives.networks,
              receivedAt: 1,
              version: primitives.version,
            },
          ].filter(matcher),
        ),
    );
    const cachedHeads = new Map<string, Record<string, unknown>>();

    cachedHeads.set(`identity:${primitives.id}`, {
      cid: 'bafyidentity-id-http-head',
      handle: primitives.profile.handle,
      id: 'bafyidentity-id-http-head',
      identityId: primitives.id,
      networkIds: primitives.networks,
      receivedAt: 1,
      version: primitives.version,
    });

    registry.clear();
    await registry.register(
      'network-lookup',
      identityStoresWithIdentityQuery(cachedHeads, query),
    );
    repository = new OrbitDBIdentityMetadataIndex(registry);

    const records = await repository.findByIdentityId(mother.id);

    expect(records).toEqual([
      expect.objectContaining({
        cid: 'bafyidentity-id-http-head',
        identityId: primitives.id,
      }),
    ]);
    expect(query).not.toHaveBeenCalled();
  });
});

function identityStores(
  currentDocuments: Record<string, unknown>[],
  currentHeads: Map<string, Record<string, unknown>>,
) {
  return {
    heads: {
      all: jest.fn(() =>
        Promise.resolve(
          [...currentHeads.entries()].map(([key, value]) => ({ key, value })),
        ),
      ),
      get: jest.fn((key: string) => {
        const value = currentHeads.get(key);

        return Promise.resolve(value ? { key, value } : undefined);
      }),
      put: jest.fn((key: string, value: Record<string, unknown>) => {
        currentHeads.set(key, value);

        return Promise.resolve('ok');
      }),
    },
    identities: {
      put: jest.fn((document: Record<string, unknown>) => {
        upsertDocument(currentDocuments, document);

        return Promise.resolve('ok');
      }),
      query: jest.fn(
        (matcher: (document: Record<string, unknown>) => boolean) =>
          Promise.resolve(currentDocuments.filter(matcher)),
      ),
    },
  } as never;
}

function identityStoresWithIdentityQuery(
  currentHeads: Map<string, Record<string, unknown>>,
  query: jest.Mock,
) {
  return {
    heads: {
      all: jest.fn(() =>
        Promise.resolve(
          [...currentHeads.entries()].map(([key, value]) => ({ key, value })),
        ),
      ),
      get: jest.fn((key: string) => {
        const value = currentHeads.get(key);

        return Promise.resolve(value ? { key, value } : undefined);
      }),
      put: jest.fn((key: string, value: Record<string, unknown>) => {
        currentHeads.set(key, value);

        return Promise.resolve('ok');
      }),
    },
    identities: {
      put: jest.fn(() => Promise.resolve('ok')),
      query,
    },
  } as never;
}

function upsertDocument(
  currentDocuments: Record<string, unknown>[],
  newDocument: Record<string, unknown>,
): void {
  const existingIndex = currentDocuments.findIndex(
    (candidate) => candidate.id === newDocument.id,
  );

  if (existingIndex === -1) {
    currentDocuments.push(newDocument);

    return;
  }

  currentDocuments[existingIndex] = newDocument;
}

async function flushBackgroundTasks(): Promise<void> {
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}

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
