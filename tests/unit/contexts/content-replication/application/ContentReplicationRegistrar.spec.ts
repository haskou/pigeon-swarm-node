import ContentReplicationRegistrar from '@app/contexts/content-replication/application/register-content/ContentReplicationRegistrar';
import { ContentReplicationWasRegisteredEvent } from '@app/contexts/content-replication/domain/events/ContentReplicationWasRegisteredEvent';
import { ContentReplicaClaim } from '@app/contexts/content-replication/domain/ContentReplicaClaim';
import { ContentReplication } from '@app/contexts/content-replication/domain/ContentReplication';
import ContentReplicaClaimRepository from '@app/contexts/content-replication/domain/repositories/ContentReplicaClaimRepository';
import ContentReplicationRepository from '@app/contexts/content-replication/domain/repositories/ContentReplicationRepository';
import { ContentReplicationContext } from '@app/contexts/content-replication/domain/value-objects/ContentReplicationContext';
import { ContentReplicationMetadata } from '@app/contexts/content-replication/domain/value-objects/ContentReplicationMetadata';
import { ContentReplicationPriority } from '@app/contexts/content-replication/domain/value-objects/ContentReplicationPriority';
import ContentReplicationSummaryRefresher from '@app/contexts/content-replication/application/refresh-status-summary/ContentReplicationSummaryRefresher';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';
import { Timestamp } from '@haskou/value-objects';
import { mock, MockProxy } from 'jest-mock-extended';

describe('ContentReplicationRegistrar', () => {
  const cid = 'bafy-content';
  const localNodeId = '550e8400-e29b-41d4-a716-446655440010';
  const firstNetworkId = '550e8400-e29b-41d4-a716-446655440001';
  const secondNetworkId = '550e8400-e29b-41d4-a716-446655440002';

  it('adds new networks when an existing CID is registered again', async () => {
    const savedContents: ContentReplication[] = [];
    const savedClaims: unknown[] = [];
    const publishedEvents: DomainEvent[][] = [];
    const existing = ContentReplication.create(
      new IPFSId(cid),
      new ContentReplicationContext('ipfs_private_upload'),
      [new NetworkId(firstNetworkId)],
      ContentReplicationMetadata.fromPrimitives(128),
      undefined,
      ContentReplicationPriority.NORMAL,
      new Timestamp(1770000000000),
    );
    const contentRepository: ContentReplicationRepository = {
      findAll: async () => [],
      findByCid: async () => existing,
      save: async (content) => {
        savedContents.push(content);
      },
    };
    const claimRepository: ContentReplicaClaimRepository = {
      findByCids: async () => [],
      save: async (claim) => {
        savedClaims.push(claim);
      },
    };
    const eventPublisher: DomainEventPublisher = {
      publish: async (events) => {
        publishedEvents.push(events);
      },
    };

    const content = await new ContentReplicationRegistrar(
      contentRepository,
      claimRepository,
      eventPublisher,
    ).register({
      cid,
      context: 'ipfs_private_upload',
      localNodeId,
      networkIds: [firstNetworkId, secondNetworkId],
      sizeBytes: 128,
    });

    expect(content.toPrimitives().networkIds.sort()).toEqual([
      firstNetworkId,
      secondNetworkId,
    ]);
    expect(savedContents).toHaveLength(1);
    expect(savedClaims).toHaveLength(2);
    expect(publishedEvents.flat()).toHaveLength(4);
    expect(publishedEvents[0]).toHaveLength(2);
    expect(publishedEvents[0][0].eventName()).toBe(
      ContentReplicationWasRegisteredEvent.EVENT_NAME,
    );
    expect(publishedEvents[0].map((event) => event.attributes.networkIds)).toEqual([
      [firstNetworkId],
      [secondNetworkId],
    ]);
  });

  it('can register content in several networks while claiming only local replicas', async () => {
    const savedClaims: ContentReplicaClaim[] = [];
    const savedContents: ContentReplication[] = [];
    const contentRepository: ContentReplicationRepository = {
      findAll: async () => [],
      findByCid: async () => undefined,
      save: async (content) => {
        savedContents.push(content);
      },
    };
    const claimRepository: ContentReplicaClaimRepository = {
      findByCids: async () => [],
      save: async (claim) => {
        savedClaims.push(claim);
      },
    };
    const eventPublisher: DomainEventPublisher = {
      publish: async () => undefined,
    };

    const content = await new ContentReplicationRegistrar(
      contentRepository,
      claimRepository,
      eventPublisher,
    ).register({
      cid,
      context: 'public_upload',
      localNodeId,
      localReplicaNetworkIds: [secondNetworkId],
      networkIds: [firstNetworkId, secondNetworkId],
      sizeBytes: 128,
    });

    expect(content.toPrimitives().networkIds.sort()).toEqual([
      firstNetworkId,
      secondNetworkId,
    ]);
    expect(savedContents).toHaveLength(1);
    expect(savedClaims.map((claim) => claim.toPrimitives().networkId)).toEqual([
      secondNetworkId,
    ]);
  });

  it('can defer replicated side effects after saving content and local claims', async () => {
    const savedClaims: ContentReplicaClaim[] = [];
    const savedContents: ContentReplication[] = [];
    const summaryRefresher: MockProxy<ContentReplicationSummaryRefresher> =
      mock<ContentReplicationSummaryRefresher>();
    const contentRepository: ContentReplicationRepository = {
      findAll: async () => [],
      findByCid: async () => undefined,
      save: async (content) => {
        savedContents.push(content);
      },
    };
    const claimRepository: ContentReplicaClaimRepository = {
      findByCids: async () => [],
      save: async (claim) => {
        savedClaims.push(claim);
      },
    };
    const eventPublisher: DomainEventPublisher = {
      publish: () => new Promise<void>(() => undefined),
    };

    const result = await Promise.race([
      new ContentReplicationRegistrar(
        contentRepository,
        claimRepository,
        eventPublisher,
        summaryRefresher,
      )
        .register({
          cid,
          context: 'public_upload',
          deferSideEffects: true,
          localNodeId,
          localReplicaNetworkIds: [secondNetworkId],
          networkIds: [firstNetworkId, secondNetworkId],
          sizeBytes: 128,
        })
        .then(() => 'resolved'),
      new Promise<string>((resolve) => {
        setTimeout(() => resolve('timeout'), 25);
      }),
    ]);

    expect(result).toBe('resolved');
    expect(savedContents).toHaveLength(1);
    expect(savedClaims.map((claim) => claim.toPrimitives().networkId)).toEqual([
      secondNetworkId,
    ]);
    expect(summaryRefresher.refresh).toHaveBeenCalledTimes(1);
  });
});
