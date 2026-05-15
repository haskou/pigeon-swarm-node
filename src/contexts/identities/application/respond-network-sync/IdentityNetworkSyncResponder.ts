import { IdentitySyncAvailableEvent } from '@app/contexts/identities/domain/events/IdentitySyncAvailableEvent';
import MongoIdentityMetadataRepository from '@app/contexts/identities/infrastructure/mongo/MongoIdentityMetadataRepository';
import SyncResponseSuppressionTracker from '@app/contexts/shared/application/sync/SyncResponseSuppressionTracker';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';

import { IdentityNetworkSyncResponseMessage } from './messages/IdentityNetworkSyncResponseMessage';

export default class IdentityNetworkSyncResponder {
  constructor(
    private readonly metadataRepository: MongoIdentityMetadataRepository,
    private readonly eventPublisher: DomainEventPublisher,
    private readonly tracker = SyncResponseSuppressionTracker.shared(),
  ) {}

  public async respond(
    message: IdentityNetworkSyncResponseMessage,
  ): Promise<void> {
    const documents = await this.metadataRepository.findLatestByNetworkId(
      message.networkId,
    );
    const events = [];

    for (const document of documents) {
      const shouldRespond = await this.tracker.shouldRespond(
        'identity',
        document.identityId,
        message.requestId,
      );

      if (!shouldRespond) {
        continue;
      }

      events.push(
        new IdentitySyncAvailableEvent(document.identityId, {
          externalIdentifier: document.cid,
          identityId: document.identityId,
          networkId: message.networkId.valueOf(),
          requestId: message.requestId,
          version: document.version,
        }),
      );
    }

    if (events.length > 0) {
      await this.eventPublisher.publish(events);
    }
  }
}
