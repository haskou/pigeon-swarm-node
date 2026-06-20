import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';

import { CommunityMembershipRequest } from '../../domain/entities/membership/CommunityMembershipRequest';
import { CommunityModerationTarget } from '../../domain/entities/moderation/CommunityModerationTarget';
import CommunityMembershipRequestRepository from '../../domain/repositories/CommunityMembershipRequestRepository';
import { CommunityModerationAction } from '../../domain/value-objects/CommunityModerationAction';
import { CommunityModerationTargetType } from '../../domain/value-objects/CommunityModerationTargetType';
import CommunityFinder from '../find-community/CommunityFinder';
import { CommunityFindMessage } from '../find-community/messages/CommunityFindMessage';
import CommunityModerationLogRecorder from '../record-moderation-log/CommunityModerationLogRecorder';
import { CommunityMemberInviteMessage } from './messages/CommunityMemberInviteMessage';

export default class CommunityMemberInviter {
  constructor(
    private readonly communityFinder: CommunityFinder,
    private readonly requestRepository: CommunityMembershipRequestRepository,
    private readonly eventPublisher: DomainEventPublisher,
    private readonly moderationLogRecorder: CommunityModerationLogRecorder,
  ) {}

  public async invite(
    message: CommunityMemberInviteMessage,
  ): Promise<CommunityMembershipRequest> {
    const community = await this.communityFinder.find(
      new CommunityFindMessage(message.communityId.valueOf()),
    );
    const existingRequests =
      await this.requestRepository.findByCommunityAndIdentity(
        community.getId(),
        message.invitedIdentityId,
      );
    const pendingRequest = existingRequests.find((existingRequest) =>
      existingRequest.isPending(),
    );

    if (pendingRequest) {
      return pendingRequest;
    }

    const membershipRequest = community.inviteMember(
      message.actorIdentityId,
      message.invitedIdentityId,
    );

    await this.requestRepository.save(membershipRequest);
    await this.eventPublisher.publish(membershipRequest.pullDomainEvents());
    await this.moderationLogRecorder.record(
      community,
      message.actorIdentityId,
      CommunityModerationAction.INVITATION_CREATED,
      CommunityModerationTarget.create(
        CommunityModerationTargetType.MEMBERSHIP_REQUEST,
        membershipRequest.getId(),
      ),
      { identityId: message.invitedIdentityId.valueOf() },
    );

    return membershipRequest;
  }
}
