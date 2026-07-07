import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';

import { CommunityMembershipRequest } from '../../domain/entities/membership/CommunityMembershipRequest';
import CommunityMembershipRequestRepository from '../../domain/repositories/CommunityMembershipRequestRepository';
import CommunityRepository from '../../domain/repositories/CommunityRepository';
import CommunityFinder from '../find-community/CommunityFinder';
import { CommunityMembershipRequestCreateMessage } from './messages/CommunityMembershipRequestCreateMessage';

export default class CommunityMembershipRequester {
  constructor(
    private readonly communityFinder: CommunityFinder,
    private readonly communityRepository: CommunityRepository,
    private readonly requestRepository: CommunityMembershipRequestRepository,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  private async acceptAutomatically(
    community: Awaited<ReturnType<CommunityFinder['find']>>,
    membershipRequest: CommunityMembershipRequest,
  ): Promise<void> {
    community.acceptMembershipRequestAutomatically(membershipRequest);
    await this.communityRepository.save(community);
    await this.requestRepository.save(membershipRequest);
    await this.eventPublisher.publish(community.pullDomainEvents());
    await this.eventPublisher.publish(membershipRequest.pullDomainEvents());
  }

  public async request(
    message: CommunityMembershipRequestCreateMessage,
  ): Promise<CommunityMembershipRequest> {
    const community = await this.communityFinder.findById(message.communityId);
    const existingRequests =
      await this.requestRepository.findByCommunityAndIdentity(
        community.getId(),
        message.actorIdentityId,
      );
    const pendingRequest = existingRequests.find((existingRequest) =>
      existingRequest.isPending(),
    );
    const acceptedRequest = existingRequests.find((existingRequest) =>
      existingRequest.isAccepted(),
    );

    community.requestMembership(message.actorIdentityId);

    if (pendingRequest && community.isAutoJoinEnabled()) {
      await this.acceptAutomatically(community, pendingRequest);

      return pendingRequest;
    }

    if (pendingRequest) {
      return pendingRequest;
    }

    if (community.isMember(message.actorIdentityId) && acceptedRequest) {
      return acceptedRequest;
    }

    const membershipRequest = community.createMembershipRequest(
      message.actorIdentityId,
    );

    if (community.isAutoJoinEnabled()) {
      await this.acceptAutomatically(community, membershipRequest);

      return membershipRequest;
    }

    await this.requestRepository.save(membershipRequest);
    await this.eventPublisher.publish(membershipRequest.pullDomainEvents());

    return membershipRequest;
  }
}
