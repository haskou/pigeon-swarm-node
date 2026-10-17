import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';
import { assert, StringValueObject } from '@haskou/value-objects';

import { Community } from '../../domain/Community';
import { CommunityInvitation } from '../../domain/entities/invitations/CommunityInvitation';
import { CommunityModerationTarget } from '../../domain/entities/moderation/CommunityModerationTarget';
import { CommunityInvitationNotFoundError } from '../../domain/errors/CommunityInvitationNotFoundError';
import CommunityRepository from '../../domain/repositories/CommunityRepository';
import { CommunityModerationAction } from '../../domain/value-objects/CommunityModerationAction';
import { CommunityModerationTargetType } from '../../domain/value-objects/CommunityModerationTargetType';
import { CommunityOperationAction } from '../../domain/value-objects/CommunityOperationAction';
import CommunityFinder from '../find-community/CommunityFinder';
import CommunityModerationLogRecorder from '../record-moderation-log/CommunityModerationLogRecorder';
import { CommunityInvitationRevokeMessage } from './messages/CommunityInvitationRevokeMessage';

/**
 * Stores a signed `invitation_revoked`. The ledger checks the revoker's
 * authority at the revocation's parents and refuses a second revocation.
 */
export default class CommunityInvitationRevoker {
  constructor(
    private readonly communityFinder: CommunityFinder,
    private readonly communityRepository: CommunityRepository,
    private readonly eventPublisher: DomainEventPublisher,
    private readonly moderationLogRecorder: CommunityModerationLogRecorder,
  ) {}

  public async revoke(message: CommunityInvitationRevokeMessage): Promise<{
    community: Community;
    invitation: CommunityInvitation;
  }> {
    const community = await this.communityFinder.findById(message.communityId);
    const invitation = (
      await this.communityRepository.findInvitations(message.communityId)
    ).find(message.invitationId);

    assert(invitation !== undefined, new CommunityInvitationNotFoundError());

    const operation = message.operation.applyTo(
      community,
      message.actorIdentityId,
      CommunityOperationAction.INVITATION_REVOKED,
      { invitationId: message.invitationId },
    );

    await this.moderationLogRecorder.record(
      community,
      message.actorIdentityId,
      CommunityModerationAction.INVITATION_REVOKED,
      CommunityModerationTarget.create(
        CommunityModerationTargetType.INVITATION,
        new StringValueObject(message.invitationId),
      ),
      message.moderationLog,
    );
    await this.communityRepository.save(operation, message.operation.proof);
    await this.eventPublisher.publish(community.pullDomainEvents());

    return { community, invitation: invitation.revoked() };
  }
}
