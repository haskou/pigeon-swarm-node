import SyncResponseSuppressionTracker from '@app/contexts/shared/application/sync/SyncResponseSuppressionTracker';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';

import { IPFSContentReplicationWasRegisteredEvent } from '../../domain/events/IPFSContentReplicationWasRegisteredEvent';
import { IPFSContentReplicationRepository } from '../../domain/repositories/IPFSContentReplicationRepository';
import { IPFSContentReplicationNetworkSyncResponseMessage } from './messages/IPFSContentReplicationNetworkSyncResponseMessage';

export default class IPFSContentReplicationNetworkSyncResponder {
  private static readonly CONTENT_CANDIDATE_LIMIT = 500;
  private static readonly SYNC_TRACKER_RESOURCE = 'ipfs-content-replication';

  constructor(
    private readonly repository: IPFSContentReplicationRepository,
    private readonly eventPublisher: DomainEventPublisher,
    private readonly tracker = SyncResponseSuppressionTracker.shared(),
  ) {}

  public async respond(
    message: IPFSContentReplicationNetworkSyncResponseMessage,
  ): Promise<void> {
    const contents = await this.repository.findByNetworkId(
      message.networkId,
      IPFSContentReplicationNetworkSyncResponder.CONTENT_CANDIDATE_LIMIT,
    );
    const events = [];

    for (const content of contents) {
      const primitives = content.toPrimitives();
      const shouldRespond = await this.tracker.shouldRespond(
        IPFSContentReplicationNetworkSyncResponder.SYNC_TRACKER_RESOURCE,
        primitives.cid,
        message.requestId,
      );

      if (!shouldRespond) {
        continue;
      }

      events.push(
        new IPFSContentReplicationWasRegisteredEvent(primitives.cid, {
          cid: primitives.cid,
          contentType: primitives.contentType,
          context: primitives.context,
          createdAt: primitives.createdAt,
          filename: primitives.filename,
          networkIds: [message.networkId.valueOf()],
          ownerIdentityId: primitives.ownerIdentityId,
          priority: primitives.priority,
          sizeBytes: primitives.sizeBytes,
          updatedAt: primitives.updatedAt,
        }),
      );
    }

    if (events.length > 0) {
      await this.eventPublisher.publish(events);
    }
  }
}
