import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';

import { CommunityMembershipRequest } from '../../domain/entities/membership/CommunityMembershipRequest';
import { CommunityModerationTarget } from '../../domain/entities/moderation/CommunityModerationTarget';
import { CommunityRequestNotFoundError } from '../../domain/errors/CommunityRequestNotFoundError';
import CommunityMembershipRequestRepository from '../../domain/repositories/CommunityMembershipRequestRepository';
import CommunityRepository from '../../domain/repositories/CommunityRepository';
import { CommunityModerationAction } from '../../domain/value-objects/CommunityModerationAction';
import { CommunityModerationTargetType } from '../../domain/value-objects/CommunityModerationTargetType';
import CommunityFinder from '../find-community/CommunityFinder';
import CommunityModerationLogRecorder from '../record-moderation-log/CommunityModerationLogRecorder';
import { CommunityMembershipRequestUpdateMessage } from './messages/CommunityMembershipRequestUpdateMessage';

export default class CommunityMembershipRequestUpdater {
  constructor(
    private readonly communityFinder: CommunityFinder,
    private readonly communityRepository: CommunityRepository,
    private readonly requestRepository: CommunityMembershipRequestRepository,
    private readonly eventPublisher: DomainEventPublisher,
    private readonly moderationLogRecorder: CommunityModerationLogRecorder,
  ) {}

  private async acceptRequest(
    membershipRequest: CommunityMembershipRequest,
    message: CommunityMembershipRequestUpdateMessage,
  ): Promise<void> {
    const community = await this.communityFinder.findById(
      membershipRequest.getCommunityId(),
    );

    community.acceptMembershipRequest(
      message.actorIdentityId,
      membershipRequest,
    );
    await this.communityRepository.save(community);
    await this.eventPublisher.publish(community.pullDomainEvents());
    await this.recordModerationLog(community, membershipRequest, message);
  }

  private async declineRequest(
    membershipRequest: CommunityMembershipRequest,
    message: CommunityMembershipRequestUpdateMessage,
  ): Promise<void> {
    const community = await this.communityFinder.findById(
      membershipRequest.getCommunityId(),
    );

    community.declineMembershipRequest(
      message.actorIdentityId,
      membershipRequest,
    );
    await this.recordModerationLog(community, membershipRequest, message);
  }

  private async recordModerationLog(
    community: Awaited<ReturnType<CommunityFinder['find']>>,
    membershipRequest: CommunityMembershipRequest,
    message: CommunityMembershipRequestUpdateMessage,
  ): Promise<void> {
    await this.moderationLogRecorder.record(
      community,
      message.actorIdentityId,
      message.isAccepted()
        ? CommunityModerationAction.MEMBERSHIP_REQUEST_ACCEPTED
        : CommunityModerationAction.MEMBERSHIP_REQUEST_DECLINED,
      CommunityModerationTarget.create(
        CommunityModerationTargetType.MEMBERSHIP_REQUEST,
        membershipRequest.getId(),
      ),
      {
        identityId: membershipRequest.getIdentityId().valueOf(),
        type: membershipRequest.getType().valueOf(),
      },
    );
  }

  public async update(
    message: CommunityMembershipRequestUpdateMessage,
  ): Promise<CommunityMembershipRequest> {
    const membershipRequest = await this.requestRepository.findById(
      message.requestId,
    );

    if (!membershipRequest) {
      throw new CommunityRequestNotFoundError();
    }

    if (message.isAccepted()) {
      await this.acceptRequest(membershipRequest, message);
    }

    if (message.isDeclined()) {
      await this.declineRequest(membershipRequest, message);
    }

    await this.requestRepository.save(membershipRequest);
    await this.eventPublisher.publish(membershipRequest.pullDomainEvents());

    return membershipRequest;
  }
}
