import { CommunitySyncAvailableEvent } from '@app/contexts/communities/domain/events/CommunitySyncAvailableEvent';
import { MongoCommunityRepository } from '@app/contexts/communities/infrastructure/mongo/MongoCommunityRepository';
import SyncResponseSuppressionTracker from '@app/contexts/shared/application/sync/SyncResponseSuppressionTracker';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';

import { CommunityNetworkSyncResponseMessage } from './messages/CommunityNetworkSyncResponseMessage';

export default class CommunityNetworkSyncResponder {
  private static readonly COMMUNITY_CANDIDATE_LIMIT = 100;

  constructor(
    private readonly communityRepository: MongoCommunityRepository,
    private readonly eventPublisher: DomainEventPublisher,
    private readonly tracker = SyncResponseSuppressionTracker.shared(),
  ) {}

  public async respond(
    message: CommunityNetworkSyncResponseMessage,
  ): Promise<void> {
    const communities = await this.communityRepository.findByNetworkId(
      message.networkId,
      CommunityNetworkSyncResponder.COMMUNITY_CANDIDATE_LIMIT,
    );
    const events: CommunitySyncAvailableEvent[] = [];

    for (const community of communities) {
      const communityId = community.getId().valueOf();
      const shouldRespond = await this.tracker.shouldRespond(
        'community',
        communityId,
        message.requestId,
      );

      if (!shouldRespond) {
        continue;
      }

      events.push(
        new CommunitySyncAvailableEvent(communityId, {
          community: community.toPrimitives(),
          communityId,
          networkId: message.networkId.valueOf(),
          requestId: message.requestId,
        }),
      );
    }

    if (events.length > 0) {
      await this.eventPublisher.publish(events);
    }
  }
}
