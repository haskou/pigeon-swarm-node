import IPFSReplicationStatusSummaryUpdater from '@app/contexts/ipfs-replication/application/update-status-summary/IPFSReplicationStatusSummaryUpdater';
import { IPFSReplicationStatusSummary } from '@app/contexts/ipfs-replication/domain/IPFSReplicationStatusSummary';
import { IPFSReplicationStatusSummaryRepository } from '@app/contexts/ipfs-replication/domain/repositories/IPFSReplicationStatusSummaryRepository';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';

describe('IPFSReplicationStatusSummaryUpdater', () => {
  const localNodeId = '550e8400-e29b-41d4-a716-446655440010';

  it('stores aggregated replication status without exposing CID details', async () => {
    let savedSummary: IPFSReplicationStatusSummary | undefined;
    const repository: IPFSReplicationStatusSummaryRepository = {
      findByLocalNodeId: async () => undefined,
      save: async (summary) => {
        savedSummary = summary;
      },
    };

    await new IPFSReplicationStatusSummaryUpdater(repository).updateFromStatus({
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
    const summary = IPFSReplicationStatusSummary.empty(new NodeId(localNodeId));

    expect(summary.toPrimitives()).toMatchObject({
      contentCount: 0,
      localNodeId,
      localResponsibleCount: 0,
      releasableCount: 0,
      totalSizeBytes: 0,
    });
  });
});
