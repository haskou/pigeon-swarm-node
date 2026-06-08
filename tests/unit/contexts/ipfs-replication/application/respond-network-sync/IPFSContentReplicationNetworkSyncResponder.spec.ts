import IPFSContentReplicationNetworkSyncResponder from '@app/contexts/ipfs-replication/application/respond-network-sync/IPFSContentReplicationNetworkSyncResponder';
import { IPFSContentReplicationNetworkSyncResponseMessage } from '@app/contexts/ipfs-replication/application/respond-network-sync/messages/IPFSContentReplicationNetworkSyncResponseMessage';
import { IPFSContentReplicationWasRegisteredEvent } from '@app/contexts/ipfs-replication/domain/events/IPFSContentReplicationWasRegisteredEvent';
import { IPFSContentReplication } from '@app/contexts/ipfs-replication/domain/IPFSContentReplication';
import MongoIPFSContentReplicationRepository from '@app/contexts/ipfs-replication/infrastructure/mongo/MongoIPFSContentReplicationRepository';
import SyncResponseSuppressionTracker from '@app/contexts/shared/application/sync/SyncResponseSuppressionTracker';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';
import { mock, MockProxy } from 'jest-mock-extended';

import { IdentityMother } from '../../../../mothers/IdentityMother';

describe('IPFSContentReplicationNetworkSyncResponder', () => {
  const networkId = '550e8400-e29b-41d4-a716-446655440001';

  let eventPublisher: MockProxy<DomainEventPublisher>;
  let repository: MockProxy<MongoIPFSContentReplicationRepository>;
  let responder: IPFSContentReplicationNetworkSyncResponder;
  let tracker: MockProxy<SyncResponseSuppressionTracker>;
  let ownerIdentityId: string;

  beforeEach(() => {
    eventPublisher = mock<DomainEventPublisher>();
    repository = mock<MongoIPFSContentReplicationRepository>();
    tracker = mock<SyncResponseSuppressionTracker>();
    ownerIdentityId = new IdentityMother().id.valueOf();
    tracker.shouldRespond.mockResolvedValue(true);
    responder = new IPFSContentReplicationNetworkSyncResponder(
      repository,
      eventPublisher,
      tracker,
    );
  });

  function content(): IPFSContentReplication {
    return IPFSContentReplication.fromPrimitives({
      cid: 'bafkreib6abq3z336om3vljmcrhy424i3dvsblu224kyjse7ylazk7asl5i',
      contentType: 'image/png',
      context: 'community-message-attachment',
      createdAt: 1778513696020,
      filename: 'image.png',
      networkIds: [networkId, '550e8400-e29b-41d4-a716-446655440999'],
      ownerIdentityId,
      priority: 'normal',
      sizeBytes: 512,
      updatedAt: 1778513696021,
    });
  }

  it('should publish replication metadata candidates for the requested network only', async () => {
    repository.findByNetworkId.mockResolvedValue([content()]);

    await responder.respond(
      new IPFSContentReplicationNetworkSyncResponseMessage(
        networkId,
        'request-1',
      ),
    );

    expect(repository.findByNetworkId).toHaveBeenCalledWith(
      expect.objectContaining({
        valueOf: expect.any(Function),
      }),
      500,
    );
    expect(tracker.shouldRespond).toHaveBeenCalledWith(
      'ipfs-content-replication',
      'bafkreib6abq3z336om3vljmcrhy424i3dvsblu224kyjse7ylazk7asl5i',
      'request-1',
    );
    expect(eventPublisher.publish).toHaveBeenCalledWith([
      expect.any(IPFSContentReplicationWasRegisteredEvent),
    ]);
    expect(eventPublisher.publish.mock.calls[0][0][0].attributes).toMatchObject(
      {
        cid: 'bafkreib6abq3z336om3vljmcrhy424i3dvsblu224kyjse7ylazk7asl5i',
        contentType: 'image/png',
        context: 'community-message-attachment',
        filename: 'image.png',
        networkIds: [networkId],
        ownerIdentityId,
        priority: 'normal',
        sizeBytes: 512,
      },
    );
  });

  it('should not publish repeated responses', async () => {
    tracker.shouldRespond.mockResolvedValue(false);
    repository.findByNetworkId.mockResolvedValue([content()]);

    await responder.respond(
      new IPFSContentReplicationNetworkSyncResponseMessage(
        networkId,
        'request-1',
      ),
    );

    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });
});
