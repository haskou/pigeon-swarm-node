import LocalOrbitDBReplicatedHeadCache from '@app/contexts/shared/infrastructure/orbitdb/LocalOrbitDBReplicatedHeadCache';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import { mock, MockProxy } from 'jest-mock-extended';

describe('LocalOrbitDBReplicatedHeadCache', () => {
  let cache: LocalOrbitDBReplicatedHeadCache;
  let database: MockProxy<EmbeddedLocalDatabase>;

  beforeEach(() => {
    database = mock<EmbeddedLocalDatabase>();
    cache = new LocalOrbitDBReplicatedHeadCache(database);
  });

  it('returns the signature of the OrbitDB heads used to reconcile the cache', async () => {
    database.findOne.mockResolvedValue({
      networkId: 'network-1',
      reconciledHeadSignature: '["head-1"]',
      warmedAt: 1,
    });

    await expect(
      cache.findReconciledHeadSignature('network-1'),
    ).resolves.toBe('["head-1"]');
    expect(database.findOne).toHaveBeenCalledWith(
      'orbitdb_replicated_head_cache_warm_networks',
      'network-1',
    );
  });

  it('ignores a malformed reconciled head signature', async () => {
    database.findOne.mockResolvedValue({
      networkId: 'network-1',
      reconciledHeadSignature: ['head-1'],
      warmedAt: 1,
    });

    await expect(
      cache.findReconciledHeadSignature('network-1'),
    ).resolves.toBeUndefined();
  });

  it('persists the reconciled head signature with the warm marker', async () => {
    await cache.markWarm('network-1', '["head-1"]');

    expect(database.save).toHaveBeenCalledWith(
      'orbitdb_replicated_head_cache_warm_networks',
      'network-1',
      {
        networkId: 'network-1',
        reconciledHeadSignature: '["head-1"]',
        warmedAt: expect.any(Number),
      },
    );
  });
});
