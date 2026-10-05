import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';

import { CommunityRole } from '../../domain/entities/membership/CommunityRole';
import { CommunityModerationTarget } from '../../domain/entities/moderation/CommunityModerationTarget';
import CommunityRepository from '../../domain/repositories/CommunityRepository';
import { CommunityModerationAction } from '../../domain/value-objects/CommunityModerationAction';
import { CommunityModerationTargetType } from '../../domain/value-objects/CommunityModerationTargetType';
import { CommunityRoleId } from '../../domain/value-objects/CommunityRoleId';
import CommunityFinder from '../find-community/CommunityFinder';
import CommunityModerationLogRecorder from '../record-moderation-log/CommunityModerationLogRecorder';
import { CommunityRoleCreateMessage } from './messages/CommunityRoleCreateMessage';

export default class CommunityRoleCreator {
  constructor(
    private readonly communityFinder: CommunityFinder,
    private readonly communityRepository: CommunityRepository,
    private readonly eventPublisher: DomainEventPublisher,
    private readonly moderationLogRecorder: CommunityModerationLogRecorder,
  ) {}

  public async create(
    message: CommunityRoleCreateMessage,
  ): Promise<CommunityRole> {
    const community = await this.communityFinder.findById(message.communityId);
    const role = community.addRole(
      message.actorIdentityId,
      message.name,
      message.permissions,
      CommunityRoleId.derive(
        message.communityId.valueOf(),
        message.actorIdentityId.valueOf(),
        message.moderationLog.createdAt.valueOf(),
      ),
    );

    await this.moderationLogRecorder.record(
      community,
      message.actorIdentityId,
      CommunityModerationAction.ROLE_CREATED,
      CommunityModerationTarget.create(
        CommunityModerationTargetType.ROLE,
        role.getId(),
      ),
      message.moderationLog,
      { name: message.name.valueOf(), permissions: message.permissionValues },
    );
    await this.communityRepository.save(community);
    await this.eventPublisher.publish(community.pullDomainEvents());

    return role;
  }
}
