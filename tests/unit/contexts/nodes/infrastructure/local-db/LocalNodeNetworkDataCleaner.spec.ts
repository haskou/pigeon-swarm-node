import LocalNodeNetworkDataCleaner from '@app/contexts/nodes/infrastructure/local-db/LocalNodeNetworkDataCleaner';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import { mock, MockProxy } from 'jest-mock-extended';

describe('LocalNodeNetworkDataCleaner', () => {
  const networkId = new NetworkId('550e8400-e29b-41d4-a716-446655440000');
  let database: MockProxy<EmbeddedLocalDatabase>;
  let networkRegistry: MockProxy<IPFSNetworkRegistry>;
  let cleaner: LocalNodeNetworkDataCleaner;

  beforeEach(() => {
    database = mock<EmbeddedLocalDatabase>();
    networkRegistry = mock<IPFSNetworkRegistry>();
    cleaner = new LocalNodeNetworkDataCleaner(database, networkRegistry);
  });

  it('should delete IPFS storage and local state scoped to a network', async () => {
    database.find.mockResolvedValue([
      {
        _id: 'peer-to-update',
        lastSeenAt: 1770000000000,
        networks: [
          { id: networkId.valueOf(), name: 'private' },
          { id: '550e8400-e29b-41d4-a716-446655440001', name: 'public' },
        ],
      },
      {
        _id: 'peer-to-delete',
        lastSeenAt: 1770000000000,
        networks: [{ id: networkId.valueOf(), name: 'private' }],
      },
    ]);

    await cleaner.clean(networkId);

    expect(networkRegistry.deleteNetwork).toHaveBeenCalledWith(
      networkId.valueOf(),
    );
    expect(database.find).toHaveBeenCalledWith('node_peers');
    expect(database.save).toHaveBeenCalledWith(
      'node_peers',
      'peer-to-update',
      expect.objectContaining({
        networks: [
          { id: '550e8400-e29b-41d4-a716-446655440001', name: 'public' },
        ],
      }),
    );
    expect(database.delete).toHaveBeenCalledWith(
      'node_peers',
      'peer-to-delete',
    );
    expect(database.deleteMany).toHaveBeenCalledWith(
      'ipfs_replication_status_summaries',
      expect.any(Function),
    );
  });
});
