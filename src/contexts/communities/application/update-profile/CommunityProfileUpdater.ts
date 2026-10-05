import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';

import { Community } from '../../domain/Community';
import { CommunityModerationTarget } from '../../domain/entities/moderation/CommunityModerationTarget';
import CommunityRepository from '../../domain/repositories/CommunityRepository';
import { CommunityModerationAction } from '../../domain/value-objects/CommunityModerationAction';
import { CommunityModerationTargetType } from '../../domain/value-objects/CommunityModerationTargetType';
import { CommunityOperationAction } from '../../domain/value-objects/CommunityOperationAction';
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

    const operation = message.operation.applyTo(
      community,
      message.actorIdentityId,
      CommunityOperationAction.COMMUNITY_UPDATED,
      {
        ...(message.autoJoinEnabled === undefined
          ? {}
          : { autoJoinEnabled: message.autoJoinEnabled }),
        ...(message.avatar === undefined
          ? {}
          : { avatar: message.avatar.valueOf() }),
        ...(message.banner === undefined
          ? {}
          : { banner: message.banner.valueOf() }),
        description: message.description.valueOf(),
        ...(message.discoverable === undefined
          ? {}
          : { discoverable: message.discoverable }),
        name: message.name.valueOf(),
      },
    );

    await this.moderationLogRecorder.record(
      community,
      message.actorIdentityId,
      CommunityModerationAction.COMMUNITY_UPDATED,
      CommunityModerationTarget.create(
        CommunityModerationTargetType.COMMUNITY,
        community.getId(),
      ),
      message.moderationLog,
      {
        autoJoinEnabled: message.autoJoinEnabled,
        avatar: message.avatar?.valueOf(),
        banner: message.banner?.valueOf(),
        description: message.description.valueOf(),
        discoverable: message.discoverable,
        name: message.name.valueOf(),
      },
    );
    await this.repository.save(operation, message.operation.proof);
    await this.eventPublisher.publish(community.pullDomainEvents());

    return community;
  }
}
