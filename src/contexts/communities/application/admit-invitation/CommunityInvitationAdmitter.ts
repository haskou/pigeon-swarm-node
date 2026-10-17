import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';
import { assert } from '@haskou/value-objects';

import { Community } from '../../domain/Community';
import { CommunityInvitationNotFoundError } from '../../domain/errors/CommunityInvitationNotFoundError';
import CommunityRepository from '../../domain/repositories/CommunityRepository';
import { CommunityJoinMethod } from '../../domain/value-objects/CommunityJoinMethod';
import { CommunityOperationAction } from '../../domain/value-objects/CommunityOperationAction';
import CommunityFinder from '../find-community/CommunityFinder';
import { CommunityInvitationAdmitMessage } from './messages/CommunityInvitationAdmitMessage';

/**
 * Stores a manager's signed admission of a claim. The ledger judges it
 * against its causal past, so it is stored only when it is valid there.
 */
export default class CommunityInvitationAdmitter {
  constructor(
    private readonly communityFinder: CommunityFinder,
    private readonly communityRepository: CommunityRepository,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  public async admit(
    message: CommunityInvitationAdmitMessage,
  ): Promise<Community> {
    const community = await this.communityFinder.findById(message.communityId);
    const invitations = await this.communityRepository.findInvitations(
      message.communityId,
    );

    assert(
      invitations.find(message.invitationId) !== undefined,
      new CommunityInvitationNotFoundError(),
    );

    const operation = message.operation.applyTo(
      community,
      message.actorIdentityId,
      CommunityOperationAction.MEMBER_JOINED,
      {
        consent: message.consent,
        identityId: message.identityId.valueOf(),
        invitationId: message.invitationId,
        method: CommunityJoinMethod.INVITATION.valueOf(),
        possession: message.possession,
      },
    );

    await this.communityRepository.save(operation, message.operation.proof);
    await this.eventPublisher.publish(community.pullDomainEvents());

    return community;
  }
}
