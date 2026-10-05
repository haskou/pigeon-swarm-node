import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';

import { Community } from '../../domain/Community';
import { CommunityModerationTarget } from '../../domain/entities/moderation/CommunityModerationTarget';
import CommunityRepository from '../../domain/repositories/CommunityRepository';
import { CommunityModerationAction } from '../../domain/value-objects/CommunityModerationAction';
import { CommunityModerationTargetType } from '../../domain/value-objects/CommunityModerationTargetType';
import { CommunityOperationAction } from '../../domain/value-objects/CommunityOperationAction';
import CommunityFinder from '../find-community/CommunityFinder';
import CommunityModerationLogRecorder from '../record-moderation-log/CommunityModerationLogRecorder';
import { CommunityMemberBanMessage } from './messages/CommunityMemberBanMessage';

export default class CommunityMemberBanner {
  constructor(
    private readonly communityFinder: CommunityFinder,
    private readonly communityRepository: CommunityRepository,
    private readonly eventPublisher: DomainEventPublisher,
    private readonly moderationLogRecorder: CommunityModerationLogRecorder,
  ) {}

  public async ban(message: CommunityMemberBanMessage): Promise<Community> {
    const community = await this.communityFinder.findById(message.communityId);

    const operation = message.operation.applyTo(
      community,
      message.actorIdentityId,
      CommunityOperationAction.MEMBER_BANNED,
      { identityId: message.targetIdentityId.valueOf() },
    );
    await this.moderationLogRecorder.record(
      community,
      message.actorIdentityId,
      CommunityModerationAction.MEMBER_BANNED,
      CommunityModerationTarget.create(
        CommunityModerationTargetType.MEMBER,
        message.targetIdentityId,
      ),
      message.moderationLog,
      { reason: message.reason },
    );
    await this.communityRepository.save(operation, message.operation.proof);
    await this.eventPublisher.publish(community.pullDomainEvents());

    return community;
  }
}
