import { DomainEventPublisher } from '@haskou/ddd-kernel/domain';

import { Community } from '../../domain/Community';
import { CommunityModerationTarget } from '../../domain/entities/moderation/CommunityModerationTarget';
import CommunityRepository from '../../domain/repositories/CommunityRepository';
import { CommunityModerationAction } from '../../domain/value-objects/CommunityModerationAction';
import { CommunityModerationTargetType } from '../../domain/value-objects/CommunityModerationTargetType';
import CommunityFinder from '../find-community/CommunityFinder';
import CommunityModerationLogRecorder from '../record-moderation-log/CommunityModerationLogRecorder';
import { CommunityRoleUpdateMessage } from './messages/CommunityRoleUpdateMessage';

export default class CommunityRoleUpdater {
  constructor(
    private readonly communityFinder: CommunityFinder,
    private readonly communityRepository: CommunityRepository,
    private readonly eventPublisher: DomainEventPublisher,
    private readonly moderationLogRecorder: CommunityModerationLogRecorder,
  ) {}

  public async update(message: CommunityRoleUpdateMessage): Promise<Community> {
    const community = await this.communityFinder.findById(message.communityId);

    community.updateRole(
      message.actorIdentityId,
      message.roleId,
      message.name,
      message.permissions,
    );
    await this.communityRepository.save(community);
    await this.eventPublisher.publish(community.pullDomainEvents());
    await this.moderationLogRecorder.record(
      community,
      message.actorIdentityId,
      CommunityModerationAction.ROLE_UPDATED,
      CommunityModerationTarget.create(
        CommunityModerationTargetType.ROLE,
        message.roleId,
      ),
      { name: message.name.valueOf(), permissions: message.permissionValues },
    );

    return community;
  }
}
