import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';
import { StringValueObject } from '@haskou/value-objects';

import { Community } from '../../domain/Community';
import { CommunityInvitation } from '../../domain/entities/invitations/CommunityInvitation';
import { CommunityModerationTarget } from '../../domain/entities/moderation/CommunityModerationTarget';
import CommunityRepository from '../../domain/repositories/CommunityRepository';
import { CommunityModerationAction } from '../../domain/value-objects/CommunityModerationAction';
import { CommunityModerationTargetType } from '../../domain/value-objects/CommunityModerationTargetType';
import { CommunityOperationAction } from '../../domain/value-objects/CommunityOperationAction';
import CommunityFinder from '../find-community/CommunityFinder';
import CommunityModerationLogRecorder from '../record-moderation-log/CommunityModerationLogRecorder';
import { CommunityInvitationCreateMessage } from './messages/CommunityInvitationCreateMessage';

/**
 * Stores a signed `invitation_created`. The client generated the link secret
 * and sends only the public key it derives, so the node never learns it.
 */
export default class CommunityInvitationCreator {
  constructor(
    private readonly communityFinder: CommunityFinder,
    private readonly communityRepository: CommunityRepository,
    private readonly eventPublisher: DomainEventPublisher,
    private readonly moderationLogRecorder: CommunityModerationLogRecorder,
  ) {}

  public async create(message: CommunityInvitationCreateMessage): Promise<{
    community: Community;
    invitation: CommunityInvitation;
  }> {
    const community = await this.communityFinder.findById(message.communityId);
    const operation = message.operation.applyTo(
      community,
      message.actorIdentityId,
      CommunityOperationAction.INVITATION_CREATED,
      {
        expiresAt: message.expiresAt,
        invitationKey: message.invitationKey,
        ...(message.invitee === undefined ? {} : { invitee: message.invitee }),
        maxUses: message.maxUses,
      },
    );

    await this.moderationLogRecorder.record(
      community,
      message.actorIdentityId,
      CommunityModerationAction.INVITATION_CREATED,
      CommunityModerationTarget.create(
        CommunityModerationTargetType.INVITATION,
        new StringValueObject(operation.getHash()),
      ),
      message.moderationLog,
      { expiresAt: message.expiresAt, maxUses: message.maxUses },
    );
    await this.communityRepository.save(operation, message.operation.proof);
    await this.eventPublisher.publish(community.pullDomainEvents());

    return {
      community,
      invitation: CommunityInvitation.fromOperation(operation),
    };
  }
}
