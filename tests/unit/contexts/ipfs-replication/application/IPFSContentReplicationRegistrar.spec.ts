import IPFSContentReplicationRegistrar from '@app/contexts/ipfs-replication/application/register-content/IPFSContentReplicationRegistrar';
import { IPFSContentReplicationWasRegisteredEvent } from '@app/contexts/ipfs-replication/domain/events/IPFSContentReplicationWasRegisteredEvent';
import { IPFSContentReplication } from '@app/contexts/ipfs-replication/domain/IPFSContentReplication';
import IPFSContentReplicaClaimRepository from '@app/contexts/ipfs-replication/domain/repositories/IPFSContentReplicaClaimRepository';
import IPFSContentReplicationRepository from '@app/contexts/ipfs-replication/domain/repositories/IPFSContentReplicationRepository';
import { IPFSContentReplicationContext } from '@app/contexts/ipfs-replication/domain/value-objects/IPFSContentReplicationContext';
import { IPFSContentReplicationMetadata } from '@app/contexts/ipfs-replication/domain/value-objects/IPFSContentReplicationMetadata';
import { IPFSContentReplicationPriority } from '@app/contexts/ipfs-replication/domain/value-objects/IPFSContentReplicationPriority';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';
import { Timestamp } from '@haskou/value-objects';

describe('IPFSContentReplicationRegistrar', () => {
  const cid = 'bafy-content';
  const localNodeId = '550e8400-e29b-41d4-a716-446655440010';
  const firstNetworkId = '550e8400-e29b-41d4-a716-446655440001';
  const secondNetworkId = '550e8400-e29b-41d4-a716-446655440002';

  it('adds new networks when an existing CID is registered again', async () => {
    const savedContents: IPFSContentReplication[] = [];
    const savedClaims: unknown[] = [];
    const publishedEvents: DomainEvent[][] = [];
    const existing = IPFSContentReplication.create(
      new IPFSId(cid),
      new IPFSContentReplicationContext('ipfs_private_upload'),
      [new NetworkId(firstNetworkId)],
      IPFSContentReplicationMetadata.fromPrimitives(128),
      undefined,
      IPFSContentReplicationPriority.NORMAL,
      new Timestamp(1770000000000),
    );
    const contentRepository: IPFSContentReplicationRepository = {
      findAll: async () => [],
      findByCid: async () => existing,
      save: async (content) => {
        savedContents.push(content);
      },
    };
    const claimRepository: IPFSContentReplicaClaimRepository = {
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

    const content = await new IPFSContentReplicationRegistrar(
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
      IPFSContentReplicationWasRegisteredEvent.EVENT_NAME,
    );
    expect(publishedEvents[0].map((event) => event.attributes.networkIds)).toEqual([
      [firstNetworkId],
      [secondNetworkId],
    ]);
  });
});
