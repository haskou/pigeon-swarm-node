import ContentReplicationStatusFinder from '@app/contexts/content-replication/application/find-status/ContentReplicationStatusFinder';
import ContentReplicationPolicy from '@app/contexts/content-replication/domain/ContentReplicationPolicy';
import ContentReplicationRepository from '@app/contexts/content-replication/domain/repositories/ContentReplicationRepository';
import NodePeerRepository from '@app/contexts/nodes/domain/repositories/NodePeerRepository';
import NodeRepository from '@app/contexts/nodes/domain/repositories/NodeRepository';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { Timestamp } from '@haskou/value-objects';
import { mock } from 'jest-mock-extended';

const LOCAL_NODE_ID = '550e8400-e29b-41d4-a716-446655440002';

describe('ContentReplicationStatusFinder', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('counts only peers active within the fifteen minutes before the clock', async () => {
    const contentRepository = mock<ContentReplicationRepository>();
    const nodeRepository = mock<NodeRepository>();
    const nodePeerRepository = mock<NodePeerRepository>();

    jest.spyOn(Timestamp, 'now').mockReturnValue(new Timestamp(1780000000000));
    contentRepository.findAll.mockResolvedValue([]);
    nodeRepository.loadLocalNodeId.mockResolvedValue(new NodeId(LOCAL_NODE_ID));
    nodePeerRepository.findActive.mockResolvedValue([]);

    await expect(
      new ContentReplicationStatusFinder(
        contentRepository,
        nodeRepository,
        nodePeerRepository,
        new ContentReplicationPolicy(),
      ).find(),
    ).resolves.toEqual({ contents: [], localNodeId: LOCAL_NODE_ID });
    expect(nodePeerRepository.findActive).toHaveBeenCalledWith(
      new Date(1779999100000),
    );
  });
});
