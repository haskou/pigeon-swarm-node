import ReplicatedContentStorage from '@app/contexts/content-replication/application/content-storage/ReplicatedContentStorage';
import ContentReplicationStatusFinder from '@app/contexts/content-replication/application/find-status/ContentReplicationStatusFinder';
import ContentReplicationMaintainer from '@app/contexts/content-replication/application/maintain/ContentReplicationMaintainer';
import ContentReplicaClaimRepository from '@app/contexts/content-replication/domain/repositories/ContentReplicaClaimRepository';
import { DomainEvent } from '@haskou/ddd-kernel/domain';
import { DomainEventPublisher } from '@haskou/ddd-kernel/domain';

describe('ContentReplicationMaintainer', () => {
  const localNodeId = '550e8400-e29b-41d4-a716-446655440010';
  const networkId = '550e8400-e29b-41d4-a716-446655440001';

  const finderWithTwoResponsibleContents = {
    find: async () => ({
      contents: [
        {
          cid: 'bafy-success',
          contentType: 'application/octet-stream',
          context: 'ipfs_private_upload',
          createdAt: 1770000000000,
          networks: [
            {
              activeNodeCount: 2,
              desiredReplicas: 2,
              knownReplicaNodeIds: [] as string[],
              knownReplicas: 0,
              localResponsible: true,
              networkId,
              releaseLocalReplica: false,
              responsibleNodeIds: [localNodeId],
            },
          ],
          priority: 'normal',
          sizeBytes: 128,
          updatedAt: 1770000000000,
        },
        {
          cid: 'bafy-failure',
          contentType: 'application/octet-stream',
          context: 'ipfs_private_upload',
          createdAt: 1770000000000,
          networks: [
            {
              activeNodeCount: 2,
              desiredReplicas: 2,
              knownReplicaNodeIds: [] as string[],
              knownReplicas: 0,
              localResponsible: true,
              networkId,
              releaseLocalReplica: false,
              responsibleNodeIds: [localNodeId],
            },
          ],
          priority: 'normal',
          sizeBytes: 128,
          updatedAt: 1770000000000,
        },
      ],
      localNodeId,
    }),
  };

  it('continues maintaining replicas when one responsible CID cannot be fetched', async () => {
    const publishedEvents: DomainEvent[][] = [];
    const savedClaims: unknown[] = [];
    const claimRepository: ContentReplicaClaimRepository = {
      findByCids: async () => [],
      save: async (claim) => {
        savedClaims.push(claim);
      },
      withdraw: async () => undefined,
    };
    const contentStorage = {
      findJSONInNetwork: async (_cid: { valueOf(): string }) => {
        if (_cid.valueOf() === 'bafy-failure') {
          throw new Error('CID not available');
        }

        return {};
      },
      findBytesInNetwork: async () => Buffer.from([]),
      removeFromNetwork: async (): Promise<void> => undefined,
    };
    const eventPublisher: DomainEventPublisher = {
      publish: async (events) => {
        publishedEvents.push(events);
      },
    };

    const result = await new ContentReplicationMaintainer(
      finderWithTwoResponsibleContents as unknown as ContentReplicationStatusFinder,
      claimRepository,
      contentStorage as unknown as ReplicatedContentStorage,
      eventPublisher,
    ).maintain();

    expect(result).toEqual({
      claimedReplicas: 1,
      failedClaims: 1,
      failedReleases: 0,
      releasedReplicas: 0,
    });
    expect(savedClaims).toHaveLength(1);
    expect(publishedEvents).toHaveLength(1);
  });

  it('fetches public upload replicas as bytes', async () => {
    const fetchedBytes: string[] = [];
    const claimRepository: ContentReplicaClaimRepository = {
      findByCids: async () => [],
      save: async () => undefined,
      withdraw: async () => undefined,
    };
    const contentStorage = {
      findBytesInNetwork: async (_cid: { valueOf(): string }) => {
        fetchedBytes.push(_cid.valueOf());

        return Buffer.from('public');
      },
      findJSONInNetwork: async () => {
        throw new Error('Public uploads must not be fetched as JSON.');
      },
      removeFromNetwork: async (): Promise<void> => undefined,
    };
    const eventPublisher: DomainEventPublisher = {
      publish: async () => undefined,
    };

    const result = await new ContentReplicationMaintainer(
      {
        find: async () => ({
          contents: [
            {
              cid: 'bafy-public',
              contentType: 'image/png',
              context: 'ipfs_public_upload',
              createdAt: 1770000000000,
              filename: 'avatar.png',
              networks: [
                {
                  activeNodeCount: 2,
                  desiredReplicas: 2,
                  knownReplicaNodeIds: [] as string[],
                  knownReplicas: 0,
                  localResponsible: true,
                  networkId,
                  releaseLocalReplica: false,
                  responsibleNodeIds: [localNodeId],
                },
              ],
              priority: 'normal',
              sizeBytes: 128,
              updatedAt: 1770000000000,
            },
          ],
          localNodeId,
        }),
      } as unknown as ContentReplicationStatusFinder,
      claimRepository,
      contentStorage as unknown as ReplicatedContentStorage,
      eventPublisher,
    ).maintain();

    expect(result.failedClaims).toBe(0);
    expect(result.claimedReplicas).toBe(1);
    expect(fetchedBytes).toEqual(['bafy-public']);
  });

  it('releases extra local replicas marked by replication status', async () => {
    const releasedCids: string[] = [];
    const withdrawnClaims: string[] = [];
    const claimRepository: ContentReplicaClaimRepository = {
      findByCids: async () => [],
      save: async () => undefined,
      withdraw: async (cid, targetNetworkId, nodeId) => {
        withdrawnClaims.push(
          `${cid.valueOf()}:${targetNetworkId.valueOf()}:${nodeId.valueOf()}`,
        );
      },
    };
    const contentStorage = {
      findBytesInNetwork: async () => Buffer.from([]),
      findJSONInNetwork: async () => ({}),
      removeFromNetwork: async (_cid: { valueOf(): string }): Promise<void> => {
        releasedCids.push(_cid.valueOf());
      },
    };
    const eventPublisher: DomainEventPublisher = {
      publish: async () => undefined,
    };

    const result = await new ContentReplicationMaintainer(
      {
        find: async () => ({
          contents: [
            {
              cid: 'bafy-extra',
              contentType: 'application/octet-stream',
              context: 'ipfs_private_upload',
              createdAt: 1770000000000,
              networks: [
                {
                  activeNodeCount: 10,
                  desiredReplicas: 5,
                  knownReplicaNodeIds: [
                    'node-1',
                    'node-2',
                    'node-3',
                    localNodeId,
                  ],
                  knownReplicas: 4,
                  localResponsible: false,
                  networkId,
                  releaseLocalReplica: true,
                  responsibleNodeIds: ['node-1', 'node-2', 'node-3'],
                },
              ],
              priority: 'normal',
              sizeBytes: 128,
              updatedAt: 1770000000000,
            },
          ],
          localNodeId,
        }),
      } as unknown as ContentReplicationStatusFinder,
      claimRepository,
      contentStorage as unknown as ReplicatedContentStorage,
      eventPublisher,
    ).maintain();

    expect(result).toEqual({
      claimedReplicas: 0,
      failedClaims: 0,
      failedReleases: 0,
      releasedReplicas: 1,
    });
    expect(releasedCids).toEqual(['bafy-extra']);
    expect(withdrawnClaims).toEqual([`bafy-extra:${networkId}:${localNodeId}`]);
  });
});
