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

  it('should repair stale identity id heads in background', async () => {
    const mother = new IdentityMother();
    const networkId = mother.networks[0];
    const identityId = mother.id.valueOf();

    await registry.register(
      networkId.valueOf(),
      identityStores(documents, heads),
    );
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
        cid: 'bafyidentity-v2',
        version: 2,
      }),
    );
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

  it('should repair stale identity handle heads in background', async () => {
    const handle = new ProfileHandle('hasko');
    const mother = new IdentityMother().withVersion(new IdentityVersion(2));
    const networkId = mother.networks[0];
    const identityId = mother.id.valueOf();

    await registry.register(
      networkId.valueOf(),
      identityStores(documents, heads),
    );
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
        cid: 'bafyidentity-handle-v2',
        version: 2,
      }),
    );
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
