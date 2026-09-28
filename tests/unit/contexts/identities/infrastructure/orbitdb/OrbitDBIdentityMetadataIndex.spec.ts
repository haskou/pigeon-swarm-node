import { Profile } from '@app/contexts/identities/domain/Profile';
import { IdentityExternalIdentifier } from '@app/contexts/identities/domain/value-objects/IdentityExternalIdentifier';
import { IdentityVersion } from '@app/contexts/identities/domain/value-objects/IdentityVersion';
import { ProfileHandle } from '@app/contexts/identities/domain/value-objects/ProfileHandle';
import { ProfileName } from '@app/contexts/identities/domain/value-objects/ProfileName';
import OrbitDBIdentityMetadataIndex from '@app/contexts/identities/infrastructure/orbitdb/OrbitDBIdentityMetadataIndex';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { IdentityMother } from '../../../../mothers/IdentityMother';

describe('OrbitDBIdentityMetadataIndex', () => {
  const documents: Record<string, unknown>[] = [];
  const heads = new Map<string, Record<string, unknown>>();
  let registry: OrbitDBReplicatedStateRegistry;
  let ipfsManager: IPFS;
  let repository: OrbitDBIdentityMetadataIndex;

  beforeEach(async () => {
    documents.splice(0);
    heads.clear();
    registry = new OrbitDBReplicatedStateRegistry();
    registry.clear();
    await registry.register('network-1', identityStores(documents, heads));
    ipfsManager = {
      calculateJSONId: jest.fn(),
    } as unknown as IPFS;
    repository = new OrbitDBIdentityMetadataIndex(registry, ipfsManager);
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

  it('should project identity metadata only after persisting its canonical document', async () => {
    const mother = new IdentityMother();
    const identity = mother.build();
    const networkId = mother.networks[0].valueOf();
    const delayedDocument = deferred<string>();
    const stores = identityStores(documents, heads) as unknown as {
      identities: { put: jest.Mock };
    };

    registry.clear();
    await registry.register(networkId, stores as never);
    repository = new OrbitDBIdentityMetadataIndex(registry, ipfsManager);
    stores.identities.put.mockImplementation(
      async (document: Record<string, unknown>) => {
        await delayedDocument.promise;
        upsertDocument(documents, document);

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
    expect(heads.size).toBe(0);
    expect(documents).toEqual([]);
    await expect(repository.findByIdentityId(mother.id)).resolves.toEqual([]);

    delayedDocument.resolve('ok');
    await save;

    expect(documents).toEqual([
      expect.objectContaining({
        cid: 'bafyidentity-fast-head',
        identityId: mother.id.valueOf(),
      }),
    ]);
    expect(heads.size).toBe(0);
    await expect(repository.findByIdentityId(mother.id)).resolves.toEqual([
      expect.objectContaining({
        cid: 'bafyidentity-fast-head',
        identityId: mother.id.valueOf(),
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

  it('should project identity tombstones without replicating handle heads', async () => {
    const identityMother = new IdentityMother();
    const handle = new ProfileHandle('hasko');
    const identity = await identityMother.buildNext({
      previousIdentityExternalIdentifier: 'bafypreviousidentity',
      profile: new Profile(
        new ProfileName('Hasko'),
        undefined,
        undefined,
        undefined,
        handle,
      ).toPrimitives(),
    });
    const networkId = identityMother.networks[0];
    await registry.register(
      networkId.valueOf(),
      identityStores(documents, heads),
    );

    await repository.save(
      identity,
      new IdentityExternalIdentifier('bafyidentity-handle-delete'),
    );
    await repository.deleteByExternalIdentifier(
      new IdentityExternalIdentifier('bafyidentity-handle-delete'),
    );

    expect(documents).toEqual([
      expect.objectContaining({
        cid: 'bafyidentity-handle-delete',
        deleted: true,
      }),
    ]);
    expect(heads.size).toBe(0);
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
    repository = new OrbitDBIdentityMetadataIndex(registry, ipfsManager);

    await expect(repository.findByIdentityId(mother.id)).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('should read identity metadata by handle from the head index', async () => {
    const handle = new ProfileHandle('hasko');
    const mother = new IdentityMother();
    const networkId = mother.networks[0];
    const identity = await mother.buildNext({
      previousIdentityExternalIdentifier: 'bafypreviousidentity',
      profile: new Profile(
        new ProfileName('Hasko'),
        undefined,
        undefined,
        undefined,
        handle,
      ).toPrimitives(),
    });

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
    repository = new OrbitDBIdentityMetadataIndex(registry, ipfsManager);

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
    repository = new OrbitDBIdentityMetadataIndex(registry, ipfsManager);

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
    repository = new OrbitDBIdentityMetadataIndex(registry, ipfsManager);

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
    repository = new OrbitDBIdentityMetadataIndex(registry, ipfsManager);

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
    repository = new OrbitDBIdentityMetadataIndex(registry, ipfsManager);

    await expect(repository.findAll()).resolves.toEqual([
      expect.objectContaining({
        cid: 'bafyidentity-projected',
        identityId,
      }),
    ]);
  });

  it('should project the freshest replicated identity into id and handle heads', async () => {
    const identityId = new IdentityMother().id.valueOf();

    await repository.projectDocument({
      cid: 'bafyidentity-v1',
      handle: 'hasko',
      id: identityId,
      identityId,
      networkIds: ['network-1'],
      receivedAt: 1,
      version: 1,
    });
    await repository.projectDocument({
      cid: 'bafyidentity-v2',
      handle: 'hasko',
      id: identityId,
      identityId,
      networkIds: ['network-1'],
      receivedAt: 2,
      version: 2,
    });

    await expect(
      repository.findByIdentityId(new IdentityId(identityId)),
    ).resolves.toEqual([
      expect.objectContaining({
        cid: 'bafyidentity-v2',
        identityId,
        version: 2,
      }),
      expect.objectContaining({
        cid: 'bafyidentity-v1',
        identityId,
        version: 1,
      }),
    ]);
    const handleCandidates = await repository.findByHandle(
      new ProfileHandle('hasko'),
    );

    expect(handleCandidates.map(({ cid }) => cid)).toEqual([
      'bafyidentity-v2',
      'bafyidentity-v1',
    ]);
  });

  it('should preserve equal-version forks and order them by verified CID', async () => {
    const identityId = new IdentityMother().id.valueOf();

    await repository.projectDocument({
      cid: 'bafy-b-fork',
      id: identityId,
      identityId,
      networkIds: ['network-1'],
      receivedAt: 2,
      version: 2,
    });
    await repository.projectDocument({
      cid: 'bafy-a-fork',
      id: identityId,
      identityId,
      networkIds: ['network-2'],
      receivedAt: 1,
      version: 2,
    });

    const candidates = await repository.findByIdentityId(
      new IdentityId(identityId),
    );

    expect(candidates.map(({ cid }) => cid)).toEqual([
      'bafy-a-fork',
      'bafy-b-fork',
    ]);
  });

  it('should bound retained metadata candidates per identity deterministically', async () => {
    const identityId = new IdentityMother().id.valueOf();

    for (let index = 64; index >= 0; index -= 1) {
      await repository.projectDocument({
        cid: `bafy-${String(index).padStart(3, '0')}`,
        id: identityId,
        identityId,
        networkIds: ['network-1'],
        receivedAt: 65 - index,
        version: 1,
      });
    }

    const candidates = await repository.findByIdentityId(
      new IdentityId(identityId),
    );

    expect(candidates).toHaveLength(64);
    expect(candidates[0].cid).toBe('bafy-000');
    expect(candidates.at(-1)?.cid).toBe('bafy-063');
  });

  it('should retain a canonical embedded candidate when forged references fill the bound', async () => {
    const identity = new IdentityMother().build();
    const identityId = identity.toPrimitives().id;
    const cid = 'bafy-canonical-identity';

    jest
      .spyOn(ipfsManager, 'calculateJSONId')
      .mockResolvedValue(new IPFSId(cid));

    await repository.projectDocument({
      cid,
      identity: identity.toPrimitives(),
      identityId,
      networkIds: identity.toPrimitives().networks,
      version: identity.toPrimitives().version,
    });

    for (let index = 0; index < 64; index += 1) {
      await repository.projectDocument({
        cid: `bafy-forged-${String(index).padStart(3, '0')}`,
        identityId,
        version: 10_000 + index,
      });
    }

    const candidates = await repository.findByIdentityId(
      new IdentityId(identityId),
    );

    expect(candidates).toHaveLength(64);
    expect(candidates.some((candidate) => candidate.cid === cid)).toBe(true);
    await expect(repository.findAllCanonical()).resolves.toEqual([
      expect.objectContaining({ cid, identity }),
    ]);
  });

  it('should return a canonical handle candidate alongside a forged handle head', async () => {
    const mother = new IdentityMother();
    const current = mother.build().toPrimitives();
    const identity = await mother.buildNext({
      profile: {
        ...current.profile,
        handle: 'hasko',
      },
    });
    const primitives = identity.toPrimitives();
    const cid = 'bafy-canonical-handle';

    jest
      .spyOn(ipfsManager, 'calculateJSONId')
      .mockResolvedValue(new IPFSId(cid));
    await repository.projectDocument({
      cid,
      handle: 'hasko',
      identity: primitives,
      identityId: primitives.id,
      networkIds: primitives.networks,
      version: primitives.version,
    });
    registry.cacheHeadLocally('identity-handle:hasko', {
      cid: 'bafy-forged-handle',
      handle: 'hasko',
      identityId: primitives.id,
      networkIds: ['attacker-network'],
      version: 10_000,
    });

    const candidates = await repository.findByHandle(
      new ProfileHandle('hasko'),
    );

    expect(candidates.map(({ cid: candidateCid }) => candidateCid)).toEqual([
      'bafy-forged-handle',
      cid,
    ]);
  });

  it('should reject forged reference and tombstone replacements for a canonical candidate', async () => {
    const identity = new IdentityMother().build();
    const primitives = identity.toPrimitives();
    const cid = 'bafy-protected-identity';

    jest
      .spyOn(ipfsManager, 'calculateJSONId')
      .mockResolvedValue(new IPFSId(cid));
    await repository.projectDocument({
      cid,
      identity: primitives,
      identityId: primitives.id,
      networkIds: primitives.networks,
      version: primitives.version,
    });
    await repository.projectDocument({
      cid,
      identityId: primitives.id,
      networkIds: ['attacker-network'],
      version: 10_000,
    });
    await repository.projectDocument({
      cid,
      deleted: true,
      identityId: primitives.id,
      version: 10_001,
    });

    await expect(
      repository.findByIdentityId(new IdentityId(primitives.id)),
    ).resolves.toEqual([
      expect.objectContaining({
        cid,
        identity,
        networkIds: primitives.networks,
        version: primitives.version,
      }),
    ]);
  });

  it('should retain concurrent canonical projections for the same identity', async () => {
    const mother = new IdentityMother();
    const firstIdentity = mother.build();
    const secondIdentity = await mother.buildNext();
    const firstCid = new IPFSId('bafy-concurrent-first');
    const secondCid = new IPFSId('bafy-concurrent-second');
    const firstCalculation = deferred<IPFSId>();
    const secondCalculation = deferred<IPFSId>();

    jest
      .spyOn(ipfsManager, 'calculateJSONId')
      .mockImplementation(async (document: { version: number }) =>
        document.version === 1
          ? firstCalculation.promise
          : secondCalculation.promise,
      );

    const firstProjection = repository.projectDocument({
      cid: firstCid.valueOf(),
      identity: firstIdentity.toPrimitives(),
      identityId: mother.id.valueOf(),
      version: 1,
    });
    const secondProjection = repository.projectDocument({
      cid: secondCid.valueOf(),
      identity: secondIdentity.toPrimitives(),
      identityId: mother.id.valueOf(),
      version: 2,
    });

    secondCalculation.resolve(secondCid);
    await secondProjection;
    firstCalculation.resolve(firstCid);
    await firstProjection;

    const candidates = await repository.findByIdentityId(mother.id);

    expect(candidates.map(({ cid }) => cid)).toEqual([
      secondCid.valueOf(),
      firstCid.valueOf(),
    ]);
  });

  it('should not project identity metadata with conflicting identity ids', async () => {
    const identityId = new IdentityMother().id.valueOf();

    await repository.projectDocument({
      cid: 'bafyidentity-tampered',
      identity: {
        id: 'MCowBQYDK2VwAyEA+n7g5mYrSv5WVp+HrWddapvm+7mWpZmglXEcAcXAfTs=',
      },
      identityId,
      version: 2,
    });

    await expect(repository.findAll()).resolves.toEqual([]);
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
    repository = new OrbitDBIdentityMetadataIndex(registry, ipfsManager);

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
