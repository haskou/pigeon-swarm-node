import OrbitDBIdentityMetadataHeadRepairer from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBIdentityMetadataHeadRepairer';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

describe('OrbitDBIdentityMetadataHeadRepairer', () => {
  const heads = new Map<string, Record<string, unknown>>();
  const identities: Record<string, unknown>[] = [];
  let registry: OrbitDBReplicatedStateRegistry;
  let repairer: OrbitDBIdentityMetadataHeadRepairer;

  beforeEach(() => {
    heads.clear();
    identities.splice(0);
    registry = new OrbitDBReplicatedStateRegistry();
    registry.register('network-1', {
      heads: {
        all: jest.fn(async () =>
          [...heads.entries()].map(([key, value]) => ({ key, value })),
        ),
        get: jest.fn(async (key: string) => heads.get(key)),
        put: jest.fn(
          async (key: string, value: Record<string, unknown>) => {
            heads.set(key, value);

            return key;
          },
        ),
      },
      identities: {
        query: jest.fn(
          async (matcher: (document: Record<string, unknown>) => boolean) =>
            identities.filter(matcher),
        ),
      },
    } as never);
    repairer = new OrbitDBIdentityMetadataHeadRepairer(registry);
  });

  afterEach(() => {
    registry.clear();
  });

  it('repairs identity and handle heads with the latest announced version', async () => {
    identities.push(
      {
        cid: 'identity-v3',
        handle: 'old-handle',
        id: 'identity-1',
        identityId: 'identity-1',
        networkIds: ['network-1'],
        receivedAt: 3,
        version: 3,
      },
      {
        cid: 'identity-v4',
        handle: 'hasko',
        id: 'identity-1',
        lastEventId: 'event-identity-v4',
        networkIds: ['network-1'],
        receivedAt: 4,
        version: 4,
      },
    );

    await expect(repairer.repair()).resolves.toBe(1);
    expect(heads.get('identity:identity-1')).toEqual(
      expect.objectContaining({ cid: 'identity-v4', version: 4 }),
    );
    expect(heads.get('identity-handle:hasko')).toEqual(
      expect.objectContaining({ cid: 'identity-v4', version: 4 }),
    );
    expect(heads.get('identity-handle:old-handle')).toBeUndefined();
  });

  it('rejects ambiguous and unrelated IPFS content records', async () => {
    identities.push(
      {
        cid: 'ambiguous',
        identity: { id: 'identity-2' },
        identityId: 'identity-1',
        networkIds: ['network-1'],
        receivedAt: 1,
        version: 1,
      },
      {
        cid: 'bafyimage',
        contentType: 'image/png',
        id: 'bafyimage',
        networkIds: ['network-1'],
        receivedAt: 2,
        sizeBytes: 123,
        version: 1,
      },
    );

    await expect(repairer.repair()).resolves.toBe(0);
    expect(heads.size).toBe(0);
  });
});
