import ContentReplicationStatusSummaryUpdater from '@app/contexts/content-replication/application/update-status-summary/ContentReplicationStatusSummaryUpdater';
import { ContentReplicationStatusSummary } from '@app/contexts/content-replication/domain/ContentReplicationStatusSummary';
import ContentReplicationStatusSummaryRepository from '@app/contexts/content-replication/domain/repositories/ContentReplicationStatusSummaryRepository';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';

describe('ContentReplicationStatusSummaryUpdater', () => {
  const localNodeId = '550e8400-e29b-41d4-a716-446655440010';

  it('stores aggregated replication status without exposing CID details', async () => {
    let savedSummary: ContentReplicationStatusSummary | undefined;
    const repository: ContentReplicationStatusSummaryRepository = {
      findByLocalNodeId: async (nodeId) =>
        ContentReplicationStatusSummary.empty(nodeId),
      save: async (summary) => {
        savedSummary = summary;
      },
    };

    await new ContentReplicationStatusSummaryUpdater(
      repository,
    ).updateFromStatus({
      contents: [
        {
          cid: 'bafy-one',
          contentType: 'application/octet-stream',
          context: 'ipfs_private_upload',
          createdAt: 1770000000000,
          networks: [
            {
              activeNodeCount: 6,
              desiredReplicas: 5,
              knownReplicaNodeIds: [],
              knownReplicas: 0,
              localResponsible: true,
              networkId: '550e8400-e29b-41d4-a716-446655440001',
              releaseLocalReplica: false,
              responsibleNodeIds: [localNodeId],
            },
          ],
          ownerIdentityId: 'owner-one',
          priority: 'normal',
          sizeBytes: 100,
          updatedAt: 1770000000000,
        },
        {
          cid: 'bafy-two',
          contentType: 'image/png',
          context: 'ipfs_public_upload',
          createdAt: 1770000000000,
          networks: [
            {
              activeNodeCount: 6,
              desiredReplicas: 5,
              knownReplicaNodeIds: [],
              knownReplicas: 0,
              localResponsible: false,
              networkId: '550e8400-e29b-41d4-a716-446655440001',
              releaseLocalReplica: true,
              responsibleNodeIds: [],
            },
          ],
          ownerIdentityId: 'owner-two',
          priority: 'normal',
          sizeBytes: 200,
          updatedAt: 1770000000000,
        },
      ],
      localNodeId,
    });

    expect(savedSummary?.toPrimitives()).toMatchObject({
      contentCount: 2,
      localNodeId,
      localResponsibleCount: 1,
      releasableCount: 1,
      totalSizeBytes: 300,
    });
  });

  it('returns an empty summary when none has been projected yet', () => {
    const summary = ContentReplicationStatusSummary.empty(
      new NodeId(localNodeId),
    );

    expect(summary.toPrimitives()).toMatchObject({
      contentCount: 0,
      localNodeId,
      localResponsibleCount: 0,
      releasableCount: 0,
      totalSizeBytes: 0,
    });
  });
});
