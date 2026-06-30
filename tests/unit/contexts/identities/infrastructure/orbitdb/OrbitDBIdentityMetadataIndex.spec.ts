import { Profile } from '@app/contexts/identities/domain/Profile';
import { IdentityExternalIdentifier } from '@app/contexts/identities/domain/value-objects/IdentityExternalIdentifier';
import { IdentityVersion } from '@app/contexts/identities/domain/value-objects/IdentityVersion';
import { ProfileHandle } from '@app/contexts/identities/domain/value-objects/ProfileHandle';
import { ProfileName } from '@app/contexts/identities/domain/value-objects/ProfileName';
import OrbitDBIdentityMetadataIndex from '@app/contexts/identities/infrastructure/orbitdb/OrbitDBIdentityMetadataIndex';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import HttpRequestContext from '@app/shared/infrastructure/express/HttpRequestContext';
import type { Request } from 'express';

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
    heads.set(`identity:${identityId}`, {
      cid: 'bafyidentity-v1',
      id: identityId,
      identityId,
      networkIds: [networkId.valueOf()],
      receivedAt: 1,
      version: 1,
    });
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
    heads.set(`identity-handle:${handle.valueOf()}`, {
      cid: 'bafyidentity-handle-v1',
      handle: handle.valueOf(),
      id: identityId,
      identityId,
      networkIds: [networkId.valueOf()],
      receivedAt: 1,
      version: 1,
    });
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

  it('should not query stored identity records by handle during http requests', async () => {
    const query = jest.fn(() =>
      Promise.reject(new Error('HTTP identity lookup should not scan stores')),
    );

    registry.clear();
    await registry.register(
      'network-http',
      identityStoresWithIdentityQuery(new Map(), query),
    );
    repository = new OrbitDBIdentityMetadataIndex(registry);

    const records = await runHttpRequest(() =>
      repository.findByHandle(new ProfileHandle('hasko')),
    );

    expect(records).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('should use cached identity records by handle during http requests', async () => {
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
      'network-http',
      identityStoresWithIdentityQuery(cachedHeads, query),
    );
    repository = new OrbitDBIdentityMetadataIndex(registry);

    const records = await runHttpRequest(() =>
      repository.findByHandle(new ProfileHandle('hasko')),
    );

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

  it('should not query stored identity records by identity id during http requests', async () => {
    const query = jest.fn(() =>
      Promise.reject(new Error('HTTP identity lookup should not scan stores')),
    );
    const mother = new IdentityMother();

    registry.clear();
    await registry.register(
      'network-http',
      identityStoresWithIdentityQuery(new Map(), query),
    );
    repository = new OrbitDBIdentityMetadataIndex(registry);

    const records = await runHttpRequest(() =>
      repository.findByIdentityId(mother.id),
    );

    expect(records).toEqual([]);
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

function runHttpRequest<T>(callback: () => T): T {
  return HttpRequestContext.run(
    {
      method: 'GET',
      originalUrl: '/api/identities/hasko',
      path: '/identities/hasko',
      url: '/api/identities/hasko',
    } as Request,
    callback,
  );
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
