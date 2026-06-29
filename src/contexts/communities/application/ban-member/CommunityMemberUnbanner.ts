import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';

import { Community } from '../../domain/Community';
import { CommunityModerationTarget } from '../../domain/entities/moderation/CommunityModerationTarget';
import CommunityRepository from '../../domain/repositories/CommunityRepository';
import { CommunityModerationAction } from '../../domain/value-objects/CommunityModerationAction';
import { CommunityModerationTargetType } from '../../domain/value-objects/CommunityModerationTargetType';
import CommunityFinder from '../find-community/CommunityFinder';
import CommunityModerationLogRecorder from '../record-moderation-log/CommunityModerationLogRecorder';
import { CommunityMemberUnbanMessage } from './messages/CommunityMemberUnbanMessage';

export default class CommunityMemberUnbanner {
  constructor(
    private readonly communityFinder: CommunityFinder,
    private readonly communityRepository: CommunityRepository,
    private readonly eventPublisher: DomainEventPublisher,
    private readonly moderationLogRecorder: CommunityModerationLogRecorder,
  ) {}

  public async unban(message: CommunityMemberUnbanMessage): Promise<Community> {
    const community = await this.communityFinder.findById(message.communityId);

    community.unbanMember(message.actorIdentityId, message.targetIdentityId);
    await this.communityRepository.save(community);
    await this.eventPublisher.publish(community.pullDomainEvents());
    await this.moderationLogRecorder.record(
      community,
      message.actorIdentityId,
      CommunityModerationAction.MEMBER_UNBANNED,
      CommunityModerationTarget.create(
        CommunityModerationTargetType.MEMBER,
        message.targetIdentityId,
      ),
    );

    return community;
  }
}
