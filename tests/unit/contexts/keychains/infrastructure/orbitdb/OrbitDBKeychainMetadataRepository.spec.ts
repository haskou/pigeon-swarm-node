import { KeychainExternalIdentifier } from '@app/contexts/keychains/domain/value-objects/KeychainExternalIdentifier';
import OrbitDBKeychainMetadataRepository from '@app/contexts/keychains/infrastructure/orbitdb/OrbitDBKeychainMetadataRepository';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { KeychainMother } from '../../../../mothers/KeychainMother';

describe('OrbitDBKeychainMetadataRepository', () => {
  const documents: Record<string, unknown>[] = [];
  const heads = new Map<string, Record<string, unknown>>();
  let registry: OrbitDBReplicatedStateRegistry;
  let repository: OrbitDBKeychainMetadataRepository;

  beforeEach(async () => {
    documents.splice(0);
    heads.clear();
    registry = new OrbitDBReplicatedStateRegistry();
    registry.clear();
    await registry.register('network-1', keychainStores(documents, heads));
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
    expect(records[0].keychain?.toPrimitives()).toEqual(
      expect.objectContaining({
        encryptedPayload: mother.encryptedPayload,
        ownerIdentityId: mother.ownerIdentityId.valueOf(),
        signature: mother.signature().valueOf(),
        timestamp: mother.timestamp.valueOf(),
        version: 2,
      }),
    );
  });

  it('should return all non-deleted keychain metadata ordered by freshness', async () => {
    await registry.putHead('keychain:owner-1', {
      cid: 'old',
      id: 'owner-1',
      ownerIdentityId: 'owner-1',
      receivedAt: 1,
      version: 1,
    });
    await registry.putHead('keychain:owner-2', {
      cid: 'deleted',
      deleted: true,
      id: 'owner-2',
      ownerIdentityId: 'owner-2',
      receivedAt: 3,
      version: 3,
    });
    await registry.putHead('keychain:owner-3', {
      cid: 'new',
      id: 'owner-3',
      ownerIdentityId: 'owner-3',
      receivedAt: 2,
      version: 2,
    });

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

  it('should keep every keychain version addressable by external identifier', async () => {
    const mother = await KeychainMother.create();
    const firstVersion = mother.withVersion(1).build();
    const secondVersion = mother
      .withVersion(2)
      .withPreviousKeychainExternalIdentifier('bafykeychain-v1')
      .build();

    await repository.save(
      firstVersion,
      new KeychainExternalIdentifier('bafykeychain-v1'),
    );
    await repository.save(
      secondVersion,
      new KeychainExternalIdentifier('bafykeychain-v2'),
    );

    const latest = await repository.findByOwnerIdentityId(
      mother.ownerIdentityId,
    );
    const previous = await repository.findByExternalIdentifier(
      new KeychainExternalIdentifier('bafykeychain-v1'),
    );

    expect(latest[0]).toEqual(
      expect.objectContaining({
        cid: 'bafykeychain-v2',
        version: 2,
      }),
    );
    expect(previous).toEqual(
      expect.objectContaining({
        cid: 'bafykeychain-v1',
        version: 1,
      }),
    );
    expect(previous?.keychain?.toPrimitives()).toEqual(
      firstVersion.toPrimitives(),
    );
  });

  it('should find the latest owner keychain from cid heads when the owner head is missing', async () => {
    const mother = await KeychainMother.create();
    const older = mother.withVersion(1).build();
    const latest = mother
      .withVersion(2)
      .withPreviousKeychainExternalIdentifier('bafykeychain-v1')
      .build();
    const olderPrimitives = older.toPrimitives();
    const latestPrimitives = latest.toPrimitives();

    await registry.putHead('keychain-cid:bafykeychain-v1', {
      cid: 'bafykeychain-v1',
      encryptedPayload: olderPrimitives.encryptedPayload,
      id: 'bafykeychain-v1',
      ownerIdentityId: mother.ownerIdentityId.valueOf(),
      previousCid: olderPrimitives.previousKeychainExternalIdentifier,
      receivedAt: 1,
      signature: olderPrimitives.signature,
      timestamp: olderPrimitives.timestamp,
      version: olderPrimitives.version,
    });
    await registry.putHead('keychain-cid:bafykeychain-v2', {
      cid: 'bafykeychain-v2',
      encryptedPayload: latestPrimitives.encryptedPayload,
      id: 'bafykeychain-v2',
      ownerIdentityId: mother.ownerIdentityId.valueOf(),
      previousCid: latestPrimitives.previousKeychainExternalIdentifier,
      receivedAt: 2,
      signature: latestPrimitives.signature,
      timestamp: latestPrimitives.timestamp,
      version: latestPrimitives.version,
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
    expect(records[0].keychain?.toPrimitives()).toEqual(latest.toPrimitives());
  });

  it('should repair stale keychain owner heads in background', async () => {
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
        cid: 'bafykeychain-v1',
        version: 1,
      }),
    );
    await flushBackgroundTasks();
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
    keychains: {
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
