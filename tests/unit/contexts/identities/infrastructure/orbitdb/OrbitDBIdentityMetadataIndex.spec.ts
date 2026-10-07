import { Identity } from '@app/contexts/identities/domain/Identity';
import { IdentityExternalIdentifier } from '@app/contexts/identities/domain/value-objects/IdentityExternalIdentifier';
import { ProfileHandle } from '@app/contexts/identities/domain/value-objects/ProfileHandle';
import IpfsIdentityMapper from '@app/contexts/identities/infrastructure/ipfs/mappers/IpfsIdentityMapper';
import OrbitDBIdentityMetadataIndex from '@app/contexts/identities/infrastructure/orbitdb/OrbitDBIdentityMetadataIndex';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { mock } from 'jest-mock-extended';
import { createHash } from 'node:crypto';

import { IdentityMother } from '../../../../mothers/IdentityMother';
import { SignedIdentityMother } from '../../../../mothers/SignedIdentityMother';

describe('OrbitDBIdentityMetadataIndex', () => {
  const mapper = new IpfsIdentityMapper();
  const documents: Record<string, unknown>[] = [];
  const heads = new Map<string, Record<string, unknown>>();
  let registry: OrbitDBReplicatedStateRegistry;
  let ipfsManager: ReturnType<typeof mock<IPFS>>;
  let index: OrbitDBIdentityMetadataIndex;

  function cidOf(identity: Identity): string {
    return `bafy${createHash('sha256')
      .update(JSON.stringify(mapper.toDocument(identity)))
      .digest('hex')}`;
  }

  function documentOf(
    identity: Identity,
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    const primitives = identity.toPrimitives();
    const cid = cidOf(identity);

    return {
      cid,
      handle: primitives.profile.handle,
      id: cid,
      identity: primitives,
      identityId: primitives.id,
      networkIds: primitives.networks,
      previousCid: primitives.previousIdentityExternalIdentifier,
      version: primitives.version,
      ...overrides,
    };
  }

  beforeEach(async () => {
    documents.splice(0);
    heads.clear();
    registry = new OrbitDBReplicatedStateRegistry();
    registry.clear();
    await registry.register('network-1', identityStores(documents, heads));
    ipfsManager = mock<IPFS>();
    ipfsManager.calculateJSONId.mockImplementation((data) =>
      Promise.resolve(
        new IPFSId(
          `bafy${createHash('sha256').update(JSON.stringify(data)).digest('hex')}`,
        ),
      ),
    );
    index = new OrbitDBIdentityMetadataIndex(registry, ipfsManager);
  });

  afterEach(() => {
    registry.clear();
  });

  it('should save identity metadata keyed by its content id and find it by network', async () => {
    const mother = new IdentityMother();
    const networkId = mother.networks[0];
    const identity = mother.withNetworks([networkId]).build();
    const cid = cidOf(identity);

    await registry.register(
      networkId.valueOf(),
      identityStores(documents, heads),
    );

    await index.save(identity, new IdentityExternalIdentifier(cid));

    expect(documents).toEqual([
      expect.objectContaining({
        cid,
        id: cid,
        identityId: mother.id.valueOf(),
      }),
    ]);
    expect(documents[0]).not.toHaveProperty('receivedAt');
    expect(documents[0]).not.toHaveProperty('deleted');

    const records = await index.findLatestByNetworkId(networkId);

    expect(records).toEqual([
      expect.objectContaining({
        cid,
        identityId: mother.id.valueOf(),
        networkIds: [networkId.valueOf()],
        version: 1,
      }),
    ]);
    expect(records[0].identity.toPrimitives()).toEqual(identity.toPrimitives());
  });

  it('should project identity metadata only after persisting its document', async () => {
    const mother = new IdentityMother();
    const identity = mother.build();
    const cid = cidOf(identity);
    const delayed = deferred<string>();
    const stores = identityStores(documents, heads) as unknown as {
      identities: { put: jest.Mock };
    };

    registry.clear();
    await registry.register(mother.networks[0].valueOf(), stores as never);
    index = new OrbitDBIdentityMetadataIndex(registry, ipfsManager);
    stores.identities.put.mockImplementation(
      async (document: Record<string, unknown>) => {
        await delayed.promise;
        upsertDocument(documents, document);

        return 'ok';
      },
    );

    const save = index.save(identity, new IdentityExternalIdentifier(cid));
    const result = await Promise.race([
      save.then(() => 'saved'),
      new Promise((resolve) => setTimeout(() => resolve('blocked'), 10)),
    ]);

    expect(result).toBe('blocked');
    await expect(index.findByIdentityId(mother.id)).resolves.toEqual([]);

    delayed.resolve('ok');
    await save;

    await expect(index.findByIdentityId(mother.id)).resolves.toEqual([
      expect.objectContaining({ cid, identityId: mother.id.valueOf() }),
    ]);
  });

  it('should not project a reference-only record', async () => {
    const mother = new IdentityMother();
    const identity = mother.build();
    const referenceOnly = documentOf(identity);

    delete referenceOnly.identity;

    await index.projectDocument(referenceOnly);

    await expect(index.findByIdentityId(mother.id)).resolves.toEqual([]);
    await expect(index.findAll()).resolves.toEqual([]);
  });

  it('should not project an embedded identity under a different content id', async () => {
    const mother = new IdentityMother();
    const identity = mother.build();

    await index.projectDocument(
      documentOf(identity, { cid: 'bafyforged', id: 'bafyforged' }),
    );

    await expect(index.findAll()).resolves.toEqual([]);
  });

  it('should not project a record whose embedded identity signature is invalid', async () => {
    const mother = new IdentityMother();
    const identity = mother.build();
    const document = documentOf(identity);

    await index.projectDocument({
      ...document,
      identity: {
        ...(document.identity as Record<string, unknown>),
        signature: 'AAAA',
      },
    });

    await expect(index.findAll()).resolves.toEqual([]);
  });

  it('should derive metadata from the signed identity instead of redundant fields', async () => {
    const mother = new IdentityMother();
    const networkId = mother.networks[0];
    const identity = mother.build();

    await index.projectDocument(
      documentOf(identity, {
        identityId: 'another-identity',
        networkIds: ['550e8400-e29b-41d4-a716-446655440999'],
        version: 99,
      }),
    );

    await expect(index.findByIdentityId(mother.id)).resolves.toEqual([
      expect.objectContaining({
        identityId: mother.id.valueOf(),
        networkIds: [networkId.valueOf()],
        version: 1,
      }),
    ]);
  });

  it('should order candidates by version then content id regardless of receipt order', async () => {
    const signer = await SignedIdentityMother.create();
    const first = signer.build({ handle: 'order', version: 1 });
    const second = signer.build({
      handle: 'order',
      previousIdentityExternalIdentifier: cidOf(first),
      timestamp: 1773848829056,
      version: 2,
    });

    await index.projectDocument(documentOf(first));
    await index.projectDocument(documentOf(second));

    const records = await index.findByIdentityId(new IdentityId(signer.id));

    expect(records.map(({ version }) => version)).toEqual([2, 1]);
  });

  it('should retain at most the per-identity candidate bound', async () => {
    const signer = await SignedIdentityMother.create();
    const versions = Array.from(
      { length: OrbitDBIdentityMetadataIndex.MAX_CANDIDATES_PER_IDENTITY + 5 },
      (_, offset) =>
        signer.build({ timestamp: 1000 + offset, version: offset + 1 }),
    );

    for (const version of versions) {
      await index.projectDocument(documentOf(version));
    }

    const records = await index.findAllCanonical();

    expect(records).toHaveLength(
      OrbitDBIdentityMetadataIndex.MAX_CANDIDATES_PER_IDENTITY,
    );
    expect(records[0].version).toBe(versions.length);
  });

  describe('handle ownership', () => {
    const handle = new ProfileHandle('claimed');

    async function claimants(count: number) {
      return Promise.all(
        Array.from({ length: count }, async (_, position) => {
          const signer = await SignedIdentityMother.create();

          return {
            identity: signer.build({
              handle: 'claimed',
              timestamp: 5000 + position,
            }),
            signer,
          };
        }),
      );
    }

    it('should resolve a handle only to the earliest signed claim', async () => {
      const [late, early] = await claimants(2);
      const earliest = early.signer.build({ handle: 'claimed', timestamp: 1 });

      await index.projectDocument(documentOf(late.identity));
      await index.projectDocument(documentOf(earliest));

      const records = await index.findByHandle(handle);

      expect(records).toHaveLength(1);
      expect(records[0].identityId).toBe(early.signer.id);
    });

    it('should converge on the same owner for every projection order', async () => {
      const claims = await claimants(4);
      const owners = new Set<string>();

      for (const order of permutations(claims)) {
        registry.clear();
        await registry.register('network-1', identityStores([], new Map()));
        index = new OrbitDBIdentityMetadataIndex(registry, ipfsManager);

        for (const claim of order) {
          await index.projectDocument(documentOf(claim.identity));
        }

        const records = await index.findByHandle(handle);

        expect(records).toHaveLength(1);
        owners.add(records[0].identityId);
      }

      expect(owners).toEqual(new Set([claims[0].signer.id]));
    });

    it('should break equal timestamps by the lowest identity id', async () => {
      const claims = await Promise.all(
        Array.from({ length: 3 }, async () => {
          const signer = await SignedIdentityMother.create();

          return {
            identity: signer.build({ handle: 'claimed', timestamp: 7 }),
            signer,
          };
        }),
      );

      for (const claim of claims) {
        await index.projectDocument(documentOf(claim.identity));
      }

      const lowest = claims.map(({ signer }) => signer.id).sort()[0];

      await expect(index.findByHandle(handle)).resolves.toEqual([
        expect.objectContaining({ identityId: lowest }),
      ]);
    });

    it('should release a handle when the identity publishes a newer version without it', async () => {
      const [first, second] = await claimants(2);
      const renamed = first.signer.build({
        handle: 'other',
        previousIdentityExternalIdentifier: cidOf(first.identity),
        timestamp: 9000,
        version: 2,
      });

      await index.projectDocument(documentOf(first.identity));
      await index.projectDocument(documentOf(second.identity));
      await index.projectDocument(documentOf(renamed));

      await expect(index.findByHandle(handle)).resolves.toEqual([
        expect.objectContaining({ identityId: second.signer.id }),
      ]);
      await expect(
        index.findByHandle(new ProfileHandle('other')),
      ).resolves.toEqual([
        expect.objectContaining({ identityId: first.signer.id }),
      ]);
    });

    it('should keep every claimant so the owner never depends on history', async () => {
      const claims = await claimants(11);
      const departures = claims.slice(0, 8).map(({ identity, signer }, at) =>
        signer.build({
          handle: `left${at}`,
          previousIdentityExternalIdentifier: cidOf(identity),
          timestamp: 9000,
          version: 2,
        }),
      );

      for (const claim of [...claims].reverse()) {
        await index.projectDocument(documentOf(claim.identity));
      }

      await expect(index.findByHandle(handle)).resolves.toEqual([
        expect.objectContaining({ identityId: claims[0].signer.id }),
      ]);

      for (const departure of departures) {
        await index.projectDocument(documentOf(departure));
      }

      await expect(index.findByHandle(handle)).resolves.toEqual([
        expect.objectContaining({ identityId: claims[8].signer.id }),
      ]);
    });
  });

  it('should not project metadata that is not an identity document', async () => {
    await index.projectDocument({ cid: 'bafy', id: 'bafy', version: 1 });

    await expect(index.findAll()).resolves.toEqual([]);
    expect(
      await index.findLatestByNetworkId(
        new NetworkId('550e8400-e29b-41d4-a716-446655440000'),
      ),
    ).toEqual([]);
  });
});

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];

  return items.flatMap((item, position) =>
    permutations([
      ...items.slice(0, position),
      ...items.slice(position + 1),
    ]).map((rest) => [item, ...rest]),
  );
}

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
