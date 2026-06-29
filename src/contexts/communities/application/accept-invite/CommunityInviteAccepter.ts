import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';

import { Community } from '../../domain/Community';
import { CommunityInviteNotFoundError } from '../../domain/errors/CommunityInviteNotFoundError';
import { CommunityInviteWasAcceptedEvent } from '../../domain/events/CommunityInviteWasAcceptedEvent';
import CommunityInviteRepository from '../../domain/repositories/CommunityInviteRepository';
import CommunityRepository from '../../domain/repositories/CommunityRepository';
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
    const acceptedInvite = await this.inviteRepository.consume(invite);
    community.joinWithInvite(message.actorIdentityId);
    await this.communityRepository.save(community);
    await this.eventPublisher.publish([
      new CommunityInviteWasAcceptedEvent(acceptedInvite.getToken().valueOf(), {
        communityId: community.getId().valueOf(),
        identityId: message.actorIdentityId.valueOf(),
        invite: acceptedInvite.toPrimitives(),
        networkId: community.getNetworkId().valueOf(),
      }),
      ...community.pullDomainEvents(),
    ]);

    return community;
  }
}
