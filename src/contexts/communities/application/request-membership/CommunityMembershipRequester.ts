import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';
import { assert } from '@haskou/value-objects';

import { Community } from '../../domain/Community';
import { CommunityMembershipRequest } from '../../domain/entities/membership/CommunityMembershipRequest';
import { CommunityRequestAutoAcceptanceRequiredError } from '../../domain/errors/CommunityRequestAutoAcceptanceRequiredError';
import CommunityMembershipRequestRepository from '../../domain/repositories/CommunityMembershipRequestRepository';
import CommunityRepository from '../../domain/repositories/CommunityRepository';
import { CommunityJoinMethod } from '../../domain/value-objects/CommunityJoinMethod';
import { CommunityOperationAction } from '../../domain/value-objects/CommunityOperationAction';
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
    community: Community,
    membershipRequest: CommunityMembershipRequest,
    message: CommunityMembershipRequestCreateMessage,
  ): Promise<void> {
    assert(
      message.acceptedAt !== undefined &&
        message.acceptedProof !== undefined &&
        message.operation !== undefined,
      new CommunityRequestAutoAcceptanceRequiredError(),
    );
    const operation = message.operation.applyTo(
      community,
      message.actorIdentityId,
      CommunityOperationAction.MEMBER_JOINED,
      {
        identityId: message.actorIdentityId.valueOf(),
        method: CommunityJoinMethod.AUTOMATIC.valueOf(),
      },
    );
    community.acceptMembershipRequestAutomatically(
      membershipRequest,
      message.acceptedAt,
    );
    await this.requestRepository.save(membershipRequest, message.acceptedProof);
    await this.communityRepository.save(operation, message.operation.proof);
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

    if (pendingRequest && !community.isAutoJoinEnabled()) {
      return pendingRequest;
    }

    if (community.isMember(message.actorIdentityId) && acceptedRequest) {
      return acceptedRequest;
    }

    const membershipRequest = community.createMembershipRequest(
      message.actorIdentityId,
      message.createdAt,
    );

    await this.requestRepository.save(membershipRequest, message.proof);

    if (community.isAutoJoinEnabled()) {
      await this.acceptAutomatically(community, membershipRequest, message);

      return membershipRequest;
    }

    await this.eventPublisher.publish(membershipRequest.pullDomainEvents());

    return membershipRequest;
  }
}
