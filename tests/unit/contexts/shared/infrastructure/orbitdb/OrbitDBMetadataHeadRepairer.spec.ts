import OrbitDBMetadataHeadRepairer from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBMetadataHeadRepairer';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

describe('OrbitDBMetadataHeadRepairer', () => {
  const heads = new Map<string, Record<string, unknown>>();
  const identities: Record<string, unknown>[] = [];
  const keychains: Record<string, unknown>[] = [];
  let registry: OrbitDBReplicatedStateRegistry;
  let repairer: OrbitDBMetadataHeadRepairer;

  beforeEach(() => {
    heads.clear();
    identities.splice(0);
    keychains.splice(0);
    registry = new OrbitDBReplicatedStateRegistry();
    registry.register(
      'network-1',
      replicatedStores(heads, identities, keychains),
    );
    repairer = new OrbitDBMetadataHeadRepairer(registry);
  });

  afterEach(() => {
    registry.clear();
  });

  it('should repair identity and keychain heads from latest metadata documents', async () => {
    heads.set('identity:identity-1', {
      cid: 'identity-v1',
      id: 'identity-1',
      identityId: 'identity-1',
      networkIds: ['network-1'],
      receivedAt: 1,
      version: 1,
    });
    heads.set('keychain:identity-1', {
      cid: 'keychain-v1',
      id: 'identity-1',
      ownerIdentityId: 'identity-1',
      receivedAt: 1,
      version: 1,
    });
    identities.push(
      {
        cid: 'identity-v1',
        id: 'identity-1',
        identityId: 'identity-1',
        networkIds: ['network-1'],
        receivedAt: 1,
        version: 1,
      },
      {
        cid: 'identity-v2',
        handle: 'hasko',
        id: 'identity-1',
        identityId: 'identity-1',
        networkIds: ['network-1'],
        receivedAt: 2,
        version: 2,
      },
    );
    keychains.push(
      {
        cid: 'keychain-v1',
        id: 'identity-1',
        ownerIdentityId: 'identity-1',
        receivedAt: 1,
        version: 1,
      },
      {
        cid: 'keychain-v2',
        id: 'identity-1',
        ownerIdentityId: 'identity-1',
        receivedAt: 2,
        version: 2,
      },
    );

    await expect(repairer.repair()).resolves.toEqual({
      identities: 1,
      keychains: 1,
    });
    expect(heads.get('identity:identity-1')).toEqual(
      expect.objectContaining({ cid: 'identity-v2', version: 2 }),
    );
    expect(heads.get('identity-handle:hasko')).toEqual(
      expect.objectContaining({ cid: 'identity-v2', version: 2 }),
    );
    expect(heads.get('keychain:identity-1')).toEqual(
      expect.objectContaining({ cid: 'keychain-v2', version: 2 }),
    );
  });
});

function replicatedStores(
  heads: Map<string, Record<string, unknown>>,
  identities: Record<string, unknown>[],
  keychains: Record<string, unknown>[],
) {
  return {
    heads: {
      all: jest.fn(async () =>
        [...heads.entries()].map(([key, value]) => ({ key, value })),
      ),
      get: jest.fn(async (key: string) => {
        const value = heads.get(key);

        return value ? { key, value } : undefined;
      }),
      put: jest.fn(async (key: string, value: Record<string, unknown>) => {
        heads.set(key, value);

        return 'ok';
      }),
    },
    identities: {
      query: jest.fn(
        async (matcher: (document: Record<string, unknown>) => boolean) =>
          identities.filter(matcher),
      ),
    },
    keychains: {
      query: jest.fn(
        async (matcher: (document: Record<string, unknown>) => boolean) =>
          keychains.filter(matcher),
      ),
    },
  } as never;
}
