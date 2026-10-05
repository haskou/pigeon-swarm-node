import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';

import { Community } from '../../domain/Community';
import { CommunityModerationTarget } from '../../domain/entities/moderation/CommunityModerationTarget';
import CommunityRepository from '../../domain/repositories/CommunityRepository';
import { CommunityModerationAction } from '../../domain/value-objects/CommunityModerationAction';
import { CommunityModerationTargetType } from '../../domain/value-objects/CommunityModerationTargetType';
import { CommunityOperationAction } from '../../domain/value-objects/CommunityOperationAction';
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

    const operation = message.operation.applyTo(
      community,
      message.actorIdentityId,
      CommunityOperationAction.ROLE_UPDATED,
      {
        name: message.name.valueOf(),
        permissions: message.permissionValues,
        roleId: message.roleId.valueOf(),
      },
    );
    await this.moderationLogRecorder.record(
      community,
      message.actorIdentityId,
      CommunityModerationAction.ROLE_UPDATED,
      CommunityModerationTarget.create(
        CommunityModerationTargetType.ROLE,
        message.roleId,
      ),
      message.moderationLog,
      { name: message.name.valueOf(), permissions: message.permissionValues },
    );
    await this.communityRepository.save(operation, message.operation.proof);
    await this.eventPublisher.publish(community.pullDomainEvents());

    return community;
  }
}
