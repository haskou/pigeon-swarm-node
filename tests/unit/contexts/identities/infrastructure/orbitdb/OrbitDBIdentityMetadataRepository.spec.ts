import { IdentityExternalIdentifier } from '@app/contexts/identities/domain/value-objects/IdentityExternalIdentifier';
import OrbitDBIdentityMetadataRepository from '@app/contexts/identities/infrastructure/orbitdb/OrbitDBIdentityMetadataRepository';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { IdentityMother } from '../../../../mothers/IdentityMother';

describe('OrbitDBIdentityMetadataRepository', () => {
  const documents: Record<string, unknown>[] = [];
  let registry: OrbitDBReplicatedStateRegistry;
  let repository: OrbitDBIdentityMetadataRepository;

  beforeEach(() => {
    documents.splice(0);
    registry = new OrbitDBReplicatedStateRegistry();
    registry.clear();
    registry.register('network-1', {
      identities: {
        put: jest.fn(async (document) => {
          upsertDocument(documents, document);

          return 'ok';
        }),
        query: jest.fn(async (matcher) => documents.filter(matcher)),
      },
    } as never);
    repository = new OrbitDBIdentityMetadataRepository(registry);
  });

  afterEach(() => {
    registry.clear();
  });

  it('should save and find latest identity metadata by network', async () => {
    const mother = new IdentityMother();
    const networkId = mother.networks[0];
    const identity = mother.withNetworks([networkId]).build();
    registry.register(networkId.valueOf(), {
      identities: {
        put: jest.fn(async (document) => {
          upsertDocument(documents, document);

          return 'ok';
        }),
        query: jest.fn(async (matcher) => documents.filter(matcher)),
      },
    } as never);

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
