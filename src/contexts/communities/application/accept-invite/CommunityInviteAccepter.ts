import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';

import { Community } from '../../domain/Community';
import { CommunityInviteNotFoundError } from '../../domain/errors/CommunityInviteNotFoundError';
import CommunityInviteRepository from '../../domain/repositories/CommunityInviteRepository';
import CommunityRepository from '../../domain/repositories/CommunityRepository';
import { CommunityJoinMethod } from '../../domain/value-objects/CommunityJoinMethod';
import { CommunityOperationAction } from '../../domain/value-objects/CommunityOperationAction';
import CommunityFinder from '../find-community/CommunityFinder';
import { CommunityInviteAcceptMessage } from './messages/CommunityInviteAcceptMessage';

export default class CommunityInviteAccepter {
  constructor(
    private readonly communityFinder: CommunityFinder,
    private readonly communityRepository: CommunityRepository,
    private readonly inviteRepository: CommunityInviteRepository,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  public async accept(
    message: CommunityInviteAcceptMessage,
  ): Promise<Community> {
    const invite = await this.inviteRepository.findByToken(message.inviteToken);

    if (!invite) {
      throw new CommunityInviteNotFoundError();
    }
    const community = await this.communityFinder.findById(
      invite.getCommunityId(),
    );

    community.requestMembership(message.actorIdentityId);
    invite.checkAcceptanceAvailability(
      await this.inviteRepository.countUses(invite),
      message.usedAt,
    );
    await this.inviteRepository.recordUse(
      invite,
      message.actorIdentityId,
      message.usedAt,
      message.proof,
    );
    const operation = message.operation.applyTo(
      community,
      message.actorIdentityId,
      CommunityOperationAction.MEMBER_JOINED,
      {
        identityId: message.actorIdentityId.valueOf(),
        method: CommunityJoinMethod.INVITE_LINK.valueOf(),
        reference: message.inviteToken.valueOf(),
      },
    );
    community.acceptInvite(message.actorIdentityId, invite);

    await this.communityRepository.save(operation, message.operation.proof);
    await this.eventPublisher.publish(community.pullDomainEvents());

    return community;
  }
}
