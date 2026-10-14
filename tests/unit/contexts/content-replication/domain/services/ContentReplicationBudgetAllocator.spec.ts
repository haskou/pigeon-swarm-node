import { ContentReplication } from '@app/contexts/content-replication/domain/ContentReplication';
import { ContentReplicationNetworkBudget } from '@app/contexts/content-replication/domain/ContentReplicationNetworkBudget';
import ContentReplicationBudgetAllocator from '@app/contexts/content-replication/domain/services/ContentReplicationBudgetAllocator';

const NETWORK = '550e8400-e29b-41d4-a716-446655440001';

const ownerOf = (seed: number): string =>
  `MCowBQYDK2VwAyEA${Buffer.alloc(32, seed).toString('base64')}`;

const record = (
  owner: number,
  cid: string,
  sizeBytes: number,
): ContentReplication =>
  ContentReplication.fromPrimitives({
    cid,
    context: 'ipfs_public_upload',
    networkId: NETWORK,
    ownerIdentityId: ownerOf(owner),
    sizeBytes,
  });

const cidsOf = (records: ContentReplication[]): string[] =>
  records.map((selected) => selected.getCid().valueOf()).sort();

describe('ContentReplicationBudgetAllocator', () => {
  const allocator = new ContentReplicationBudgetAllocator();

  it('selects every record while they fit the budget', () => {
    const records = [record(1, 'bafy-a', 40), record(2, 'bafy-b', 60)];

    expect(
      cidsOf(
        allocator.select(records, new ContentReplicationNetworkBudget(100)),
      ),
    ).toEqual(['bafy-a', 'bafy-b']);
  });

  it('never selects a record larger than the budget', () => {
    expect(
      allocator.select(
        [record(1, 'bafy-huge', 101)],
        new ContentReplicationNetworkBudget(100),
      ),
    ).toEqual([]);
  });

  it('does not let one large owner crowd out a small one', () => {
    const large = Array.from({ length: 10 }, (_, index) =>
      record(1, `bafy-large-${index}`, 100),
    );
    const small = record(2, 'bafy-small', 10);

    expect(
      cidsOf(
        allocator.select(
          [...large, small],
          new ContentReplicationNetworkBudget(120),
        ),
      ),
    ).toEqual(['bafy-large-0', 'bafy-small']);
  });

  it('keeps serving a small owner while many sybil owners flood the network', () => {
    const sybils = Array.from({ length: 50 }, (_, index) =>
      record(10 + index, `bafy-sybil-${index}`, 100),
    );
    const honest = [
      record(200, 'bafy-avatar', 5),
      record(200, 'bafy-photo', 5),
      record(200, 'bafy-file', 5),
    ];

    const selected = cidsOf(
      allocator.select(
        [...sybils, ...honest],
        new ContentReplicationNetworkBudget(300),
      ),
    );

    expect(selected).toEqual(
      expect.arrayContaining(['bafy-avatar', 'bafy-file', 'bafy-photo']),
    );
    expect(selected.filter((cid) => cid.startsWith('bafy-sybil'))).toHaveLength(
      2,
    );
  });

  it('charges a CID registered by several owners to each of them', () => {
    const shared = [record(1, 'bafy-shared', 60), record(2, 'bafy-shared', 60)];

    expect(
      allocator.select(shared, new ContentReplicationNetworkBudget(100)),
    ).toHaveLength(1);
  });

  it('selects the same records whatever their order', () => {
    const records = [
      record(1, 'bafy-a', 70),
      record(2, 'bafy-b', 30),
      record(1, 'bafy-c', 20),
      record(3, 'bafy-d', 50),
    ];
    const budget = new ContentReplicationNetworkBudget(110);

    expect(cidsOf(allocator.select([...records].reverse(), budget))).toEqual(
      cidsOf(allocator.select(records, budget)),
    );
  });
});
