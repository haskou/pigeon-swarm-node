import { KeychainExternalIdentifier } from '@app/contexts/keychains/domain/value-objects/KeychainExternalIdentifier';
import OrbitDBKeychainMetadataRepository from '@app/contexts/keychains/infrastructure/orbitdb/OrbitDBKeychainMetadataRepository';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { KeychainMother } from '../../../../mothers/KeychainMother';

describe('OrbitDBKeychainMetadataRepository', () => {
  const documents: Record<string, unknown>[] = [];
  const heads = new Map<string, Record<string, unknown>>();
  let registry: OrbitDBReplicatedStateRegistry;
  let repository: OrbitDBKeychainMetadataRepository;

  beforeEach(() => {
    documents.splice(0);
    heads.clear();
    registry = new OrbitDBReplicatedStateRegistry();
    registry.clear();
    registry.register('network-1', keychainStores(documents, heads));
    repository = new OrbitDBKeychainMetadataRepository(registry);
  });

  afterEach(() => {
    registry.clear();
  });

  it('should save and find keychain metadata by owner', async () => {
    const mother = await KeychainMother.create();
    const keychain = mother.withVersion(2).build();

    await repository.save(
      keychain,
      new KeychainExternalIdentifier('bafykeychain2'),
    );

    const records = await repository.findByOwnerIdentityId(
      mother.ownerIdentityId,
    );

    expect(records).toEqual([
      expect.objectContaining({
        cid: 'bafykeychain2',
        ownerIdentityId: mother.ownerIdentityId.valueOf(),
        version: 2,
      }),
    ]);
  });

  it('should return all non-deleted keychain metadata ordered by freshness', async () => {
    documents.push(
      {
        cid: 'old',
        id: 'owner-1',
        ownerIdentityId: 'owner-1',
        receivedAt: 1,
        version: 1,
      },
      {
        cid: 'deleted',
        deleted: true,
        id: 'owner-2',
        ownerIdentityId: 'owner-2',
        receivedAt: 3,
        version: 3,
      },
      {
        cid: 'new',
        id: 'owner-2',
        ownerIdentityId: 'owner-2',
        receivedAt: 2,
        version: 2,
      },
    );

    const records = await repository.findAll();

    expect(records).toEqual([
      expect.objectContaining({ cid: 'new' }),
      expect.objectContaining({ cid: 'old' }),
    ]);
  });

  it('should read keychain metadata by owner from the head index', async () => {
    const mother = await KeychainMother.create();
    const keychain = mother.withVersion(3).build();

    await repository.save(
      keychain,
      new KeychainExternalIdentifier('bafykeychain-head'),
    );
    documents.splice(0);

    const records = await repository.findByOwnerIdentityId(
      mother.ownerIdentityId,
    );

    expect(records).toEqual([
      expect.objectContaining({
        cid: 'bafykeychain-head',
        ownerIdentityId: mother.ownerIdentityId.valueOf(),
        version: 3,
      }),
    ]);
  });

  it('should repair stale keychain heads from newer documents', async () => {
    const mother = await KeychainMother.create();
    const ownerIdentityId = mother.ownerIdentityId.valueOf();

    heads.set(`keychain:${ownerIdentityId}`, {
      cid: 'bafykeychain-v1',
      id: ownerIdentityId,
      ownerIdentityId,
      receivedAt: 1,
      version: 1,
    });
    documents.push({
      cid: 'bafykeychain-v2',
      id: ownerIdentityId,
      ownerIdentityId,
      receivedAt: 2,
      version: 2,
    });

    const records = await repository.findByOwnerIdentityId(
      mother.ownerIdentityId,
    );

    expect(records[0]).toEqual(
      expect.objectContaining({
        cid: 'bafykeychain-v2',
        version: 2,
      }),
    );
    expect(heads.get(`keychain:${ownerIdentityId}`)).toEqual(
      expect.objectContaining({
        cid: 'bafykeychain-v2',
        version: 2,
      }),
    );
  });
});

function keychainStores(
  currentDocuments: Record<string, unknown>[],
  currentHeads: Map<string, Record<string, unknown>>,
) {
  return {
    heads: {
      all: jest.fn(async () =>
        [...currentHeads.entries()].map(([key, value]) => ({ key, value })),
      ),
      get: jest.fn(async (key: string) => {
        const value = currentHeads.get(key);

        return value ? { key, value } : undefined;
      }),
      put: jest.fn(async (key: string, value: Record<string, unknown>) => {
        currentHeads.set(key, value);

        return 'ok';
      }),
    },
    keychains: {
      put: jest.fn(async (document: Record<string, unknown>) => {
        upsertDocument(currentDocuments, document);

        return 'ok';
      }),
      query: jest.fn(
        async (matcher: (document: Record<string, unknown>) => boolean) =>
          currentDocuments.filter(matcher),
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
