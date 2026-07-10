import OrbitDBKeychainMetadataHeadRepairer from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBKeychainMetadataHeadRepairer';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

describe('OrbitDBKeychainMetadataHeadRepairer', () => {
  const heads = new Map<string, Record<string, unknown>>();
  const keychains: Record<string, unknown>[] = [];
  let registry: OrbitDBReplicatedStateRegistry;
  let repairer: OrbitDBKeychainMetadataHeadRepairer;

  beforeEach(() => {
    heads.clear();
    keychains.splice(0);
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
      keychains: {
        query: jest.fn(
          async (matcher: (document: Record<string, unknown>) => boolean) =>
            keychains.filter(matcher),
        ),
      },
    } as never);
    repairer = new OrbitDBKeychainMetadataHeadRepairer(registry);
  });

  afterEach(() => {
    registry.clear();
  });

  it('repairs every CID head and the latest owner head', async () => {
    keychains.push(
      {
        cid: 'keychain-v1',
        ownerIdentityId: 'identity-1',
        receivedAt: 1,
        version: 1,
      },
      {
        cid: 'keychain-v2',
        ownerIdentityId: 'identity-1',
        receivedAt: 2,
        version: 2,
      },
    );

    await expect(repairer.repair()).resolves.toBe(2);
    expect(heads.get('keychain-cid:keychain-v1')).toEqual(
      expect.objectContaining({ version: 1 }),
    );
    expect(heads.get('keychain-cid:keychain-v2')).toEqual(
      expect.objectContaining({ version: 2 }),
    );
    expect(heads.get('keychain:identity-1')).toEqual(
      expect.objectContaining({ cid: 'keychain-v2', version: 2 }),
    );
  });

  it('ignores deleted and malformed keychain records', async () => {
    keychains.push(
      {
        cid: 'deleted-keychain',
        deleted: true,
        ownerIdentityId: 'identity-1',
      },
      { cid: 'missing-owner' },
      { ownerIdentityId: 'identity-1' },
    );

    await expect(repairer.repair()).resolves.toBe(0);
    expect(heads.size).toBe(0);
  });
});
