import IPFSReplicationStatusFinder from '@app/contexts/ipfs-replication/application/find-status/IPFSReplicationStatusFinder';
import IPFSReplicationMaintainer from '@app/contexts/ipfs-replication/application/maintain/IPFSReplicationMaintainer';
import { IPFSContentReplicaClaimRepository } from '@app/contexts/ipfs-replication/domain/repositories/IPFSContentReplicaClaimRepository';
import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';

describe('IPFSReplicationMaintainer', () => {
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
    const claimRepository: IPFSContentReplicaClaimRepository = {
      findByCids: async () => [],
      save: async (claim) => {
        savedClaims.push(claim);
      },
    };
    const ipfs = {
      getJSONFromNetwork: async (_cid: { valueOf(): string }) => {
        if (_cid.valueOf() === 'bafy-failure') {
          throw new Error('CID not available');
        }

        return {};
      },
      getBytesFromNetwork: async () => Buffer.from([]),
      removeJSONFromNetwork: async (): Promise<void> => undefined,
    };
    const eventPublisher: DomainEventPublisher = {
      publish: async (events) => {
        publishedEvents.push(events);
      },
    };

    const result = await new IPFSReplicationMaintainer(
      finderWithTwoResponsibleContents as unknown as IPFSReplicationStatusFinder,
      claimRepository,
      ipfs as unknown as IPFS,
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
    let fetchSignal: AbortSignal | undefined;
    const claimRepository: IPFSContentReplicaClaimRepository = {
      findByCids: async () => [],
      save: async () => undefined,
    };
    const ipfs = {
      getBytesFromNetwork: async (
        _cid: { valueOf(): string },
        _networkId: string,
        signal?: AbortSignal,
      ) => {
        fetchedBytes.push(_cid.valueOf());
        fetchSignal = signal;

        return Buffer.from('public');
      },
      getJSONFromNetwork: async () => {
        throw new Error('Public uploads must not be fetched as JSON.');
      },
      removeJSONFromNetwork: async (): Promise<void> => undefined,
    };
    const eventPublisher: DomainEventPublisher = {
      publish: async () => undefined,
    };

    const result = await new IPFSReplicationMaintainer(
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
      } as unknown as IPFSReplicationStatusFinder,
      claimRepository,
      ipfs as unknown as IPFS,
      eventPublisher,
    ).maintain();

    expect(result.failedClaims).toBe(0);
    expect(result.claimedReplicas).toBe(1);
    expect(fetchedBytes).toEqual(['bafy-public']);
    expect(fetchSignal).toBeInstanceOf(AbortSignal);
  });

  it('times out replica fetches that do not settle', async () => {
    const originalTimeout = process.env.IPFS_REPLICATION_CLAIM_TIMEOUT_MS;

    process.env.IPFS_REPLICATION_CLAIM_TIMEOUT_MS = '1';

    try {
      const claimRepository: IPFSContentReplicaClaimRepository = {
        findByCids: async () => [],
        save: async () => undefined,
      };
      const ipfs = {
        getBytesFromNetwork: async () => new Promise<Buffer>(() => undefined),
        getJSONFromNetwork: async () => {
          throw new Error('Private uploads must not be fetched in this test.');
        },
        removeJSONFromNetwork: async (): Promise<void> => undefined,
      };
      const eventPublisher: DomainEventPublisher = {
        publish: async () => undefined,
      };

      const result = await new IPFSReplicationMaintainer(
        {
          find: async () => ({
            contents: [
              {
                cid: 'bafy-timeout',
                contentType: 'image/png',
                context: 'ipfs_public_upload',
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
        } as unknown as IPFSReplicationStatusFinder,
        claimRepository,
        ipfs as unknown as IPFS,
        eventPublisher,
      ).maintain();

      expect(result).toEqual({
        claimedReplicas: 0,
        failedClaims: 1,
        failedReleases: 0,
        releasedReplicas: 0,
      });
    } finally {
      if (originalTimeout === undefined) {
        delete process.env.IPFS_REPLICATION_CLAIM_TIMEOUT_MS;
      } else {
        process.env.IPFS_REPLICATION_CLAIM_TIMEOUT_MS = originalTimeout;
      }
    }
  });
});
