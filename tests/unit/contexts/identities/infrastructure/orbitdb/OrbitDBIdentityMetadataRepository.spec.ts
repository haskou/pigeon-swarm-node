import { IdentityExternalIdentifier } from '@app/contexts/identities/domain/value-objects/IdentityExternalIdentifier';
import { Profile } from '@app/contexts/identities/domain/Profile';
import { ProfileHandle } from '@app/contexts/identities/domain/value-objects/ProfileHandle';
import { ProfileName } from '@app/contexts/identities/domain/value-objects/ProfileName';
import OrbitDBIdentityMetadataRepository from '@app/contexts/identities/infrastructure/orbitdb/OrbitDBIdentityMetadataRepository';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { IdentityMother } from '../../../../mothers/IdentityMother';

describe('OrbitDBIdentityMetadataRepository', () => {
  const documents: Record<string, unknown>[] = [];
  const heads = new Map<string, Record<string, unknown>>();
  let registry: OrbitDBReplicatedStateRegistry;
  let repository: OrbitDBIdentityMetadataRepository;

  beforeEach(() => {
    documents.splice(0);
    heads.clear();
    registry = new OrbitDBReplicatedStateRegistry();
    registry.clear();
    registry.register('network-1', identityStores(documents, heads));
    repository = new OrbitDBIdentityMetadataRepository(registry);
  });

  afterEach(() => {
    registry.clear();
  });

  it('should save and find latest identity metadata by network', async () => {
    const mother = new IdentityMother();
    const networkId = mother.networks[0];
    const identity = mother.withNetworks([networkId]).build();
    registry.register(networkId.valueOf(), identityStores(documents, heads));

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

  it('should read identity metadata by identity id from the head index', async () => {
    const mother = new IdentityMother();
    const networkId = mother.networks[0];
    const identity = mother.build();

    registry.register(networkId.valueOf(), identityStores(documents, heads));

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

  it('should read identity metadata by handle from the head index', async () => {
    const handle = new ProfileHandle('hasko');
    const mother = new IdentityMother();
    const networkId = mother.networks[0];
    const identity = await mother.build().updateProfile(
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

    registry.register(networkId.valueOf(), identityStores(documents, heads));

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
  });
});

function identityStores(
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
    identities: {
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
