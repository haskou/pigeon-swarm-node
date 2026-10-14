import ContentReplicationStatusFinder from '@app/contexts/content-replication/application/find-status/ContentReplicationStatusFinder';
import { ContentReplication } from '@app/contexts/content-replication/domain/ContentReplication';
import { ContentReplicationNetworkBudget } from '@app/contexts/content-replication/domain/ContentReplicationNetworkBudget';
import ContentReplicationPolicy from '@app/contexts/content-replication/domain/ContentReplicationPolicy';
import ContentReplicationRepository from '@app/contexts/content-replication/domain/repositories/ContentReplicationRepository';
import ContentReplicationBudgetAllocator from '@app/contexts/content-replication/domain/services/ContentReplicationBudgetAllocator';
import NodePeerRepository from '@app/contexts/nodes/domain/repositories/NodePeerRepository';
import NodeRepository from '@app/contexts/nodes/domain/repositories/NodeRepository';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { Timestamp } from '@haskou/value-objects';
import { mock, MockProxy } from 'jest-mock-extended';

const LOCAL_NODE_ID = '550e8400-e29b-41d4-a716-446655440002';
const NETWORK = '550e8400-e29b-41d4-a716-446655440001';
const OTHER_NETWORK = '550e8400-e29b-41d4-a716-446655440003';

const ownerOf = (seed: number): string =>
  `MCowBQYDK2VwAyEA${Buffer.alloc(32, seed).toString('base64')}`;

const record = (
  owner: number,
  cid: string,
  sizeBytes: number,
  networkId = NETWORK,
): ContentReplication =>
  ContentReplication.fromPrimitives({
    cid,
    context: 'ipfs_public_upload',
    networkId,
    ownerIdentityId: ownerOf(owner),
    sizeBytes,
  });

describe('ContentReplicationStatusFinder', () => {
  let contentRepository: MockProxy<ContentReplicationRepository>;
  let nodePeerRepository: MockProxy<NodePeerRepository>;

  const finderWithBudget = (bytes: number): ContentReplicationStatusFinder => {
    const nodeRepository = mock<NodeRepository>();

    nodeRepository.loadLocalNodeId.mockResolvedValue(new NodeId(LOCAL_NODE_ID));

    return new ContentReplicationStatusFinder(
      contentRepository,
      nodeRepository,
      nodePeerRepository,
      new ContentReplicationPolicy(),
      new ContentReplicationNetworkBudget(bytes),
      new ContentReplicationBudgetAllocator(),
    );
  };

  const withinBudgetByCid = async (
    finder: ContentReplicationStatusFinder,
  ): Promise<Record<string, boolean>> =>
    Object.fromEntries(
      (await finder.find()).contents.map((content) => [
        `${content.networks[0].networkId}:${content.cid}`,
        content.networks[0].withinLocalBudget,
      ]),
    );

  beforeEach(() => {
    contentRepository = mock<ContentReplicationRepository>();
    nodePeerRepository = mock<NodePeerRepository>();
    nodePeerRepository.findActive.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('counts only peers active within the fifteen minutes before the clock', async () => {
    jest.spyOn(Timestamp, 'now').mockReturnValue(new Timestamp(1780000000000));
    contentRepository.findAll.mockResolvedValue([]);

    await expect(finderWithBudget(1024).find()).resolves.toEqual({
      contents: [],
      localNodeId: LOCAL_NODE_ID,
    });
    expect(nodePeerRepository.findActive).toHaveBeenCalledWith(
      new Date(1779999100000),
    );
  });

  it('marks the responsible replicas beyond the network budget as outside it', async () => {
    contentRepository.findAll.mockResolvedValue([
      record(1, 'bafy-small', 10),
      record(2, 'bafy-large', 100),
      record(2, 'bafy-larger', 100),
    ]);

    await expect(withinBudgetByCid(finderWithBudget(120))).resolves.toEqual({
      [`${NETWORK}:bafy-large`]: true,
      [`${NETWORK}:bafy-larger`]: false,
      [`${NETWORK}:bafy-small`]: true,
    });
  });

  it('gives each network its own budget', async () => {
    contentRepository.findAll.mockResolvedValue([
      record(1, 'bafy-a', 100),
      record(1, 'bafy-a', 100, OTHER_NETWORK),
    ]);

    await expect(withinBudgetByCid(finderWithBudget(100))).resolves.toEqual({
      [`${NETWORK}:bafy-a`]: true,
      [`${OTHER_NETWORK}:bafy-a`]: true,
    });
  });

  it('holds a CID several owners registered when any of their shares covers it', async () => {
    contentRepository.findAll.mockResolvedValue([
      record(1, 'bafy-own', 10),
      record(1, 'bafy-shared', 50),
      record(2, 'bafy-shared', 50),
    ]);

    await expect(withinBudgetByCid(finderWithBudget(70))).resolves.toEqual({
      [`${NETWORK}:bafy-own`]: true,
      [`${NETWORK}:bafy-shared`]: true,
    });
  });
});
