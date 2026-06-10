import { KeychainExternalIdentifier } from '@app/contexts/keychains/domain/value-objects/KeychainExternalIdentifier';
import OrbitDBKeychainMetadataRepository from '@app/contexts/keychains/infrastructure/orbitdb/OrbitDBKeychainMetadataRepository';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { KeychainMother } from '../../../../mothers/KeychainMother';

describe('OrbitDBKeychainMetadataRepository', () => {
  const documents: Record<string, unknown>[] = [];
  let registry: OrbitDBReplicatedStateRegistry;
  let repository: OrbitDBKeychainMetadataRepository;

  beforeEach(() => {
    documents.splice(0);
    registry = new OrbitDBReplicatedStateRegistry();
    registry.clear();
    registry.register('network-1', {
      keychains: {
        put: jest.fn(async (document) => {
          upsertDocument(documents, document);

          return 'ok';
        }),
        query: jest.fn(async (matcher) => documents.filter(matcher)),
      },
    } as never);
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
});

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
