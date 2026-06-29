import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';

import { Community } from '../../domain/Community';
import { CommunityModerationTarget } from '../../domain/entities/moderation/CommunityModerationTarget';
import CommunityRepository from '../../domain/repositories/CommunityRepository';
import { CommunityModerationAction } from '../../domain/value-objects/CommunityModerationAction';
import { CommunityModerationTargetType } from '../../domain/value-objects/CommunityModerationTargetType';
import CommunityFinder from '../find-community/CommunityFinder';
import CommunityModerationLogRecorder from '../record-moderation-log/CommunityModerationLogRecorder';
import { CommunityProfileUpdateMessage } from './messages/CommunityProfileUpdateMessage';

export default class CommunityProfileUpdater {
  constructor(
    private readonly communityFinder: CommunityFinder,
    private readonly repository: CommunityRepository,
    private readonly eventPublisher: DomainEventPublisher,
    private readonly moderationLogRecorder: CommunityModerationLogRecorder,
  ) {}

  public async update(
    message: CommunityProfileUpdateMessage,
  ): Promise<Community> {
    const community = await this.communityFinder.findById(message.communityId);

    community.updateProfile(
      message.actorIdentityId,
      message.name,
      message.description,
      message.avatar,
      message.banner,
      message.discoverable,
      message.autoJoinEnabled,
    );

    await this.repository.save(community);
    await this.eventPublisher.publish(community.pullDomainEvents());
    await this.moderationLogRecorder.record(
      community,
      message.actorIdentityId,
      CommunityModerationAction.COMMUNITY_UPDATED,
      CommunityModerationTarget.create(
        CommunityModerationTargetType.COMMUNITY,
        community.getId(),
      ),
      {
        autoJoinEnabled: message.autoJoinEnabled,
        avatar: message.avatar?.valueOf(),
        banner: message.banner?.valueOf(),
        description: message.description.valueOf(),
        discoverable: message.discoverable,
        name: message.name.valueOf(),
      },
    );

    return community;
  }
}
