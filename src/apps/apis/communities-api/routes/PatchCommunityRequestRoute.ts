import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityMembershipRequest } from '@app/contexts/communities/domain/entities/membership/CommunityMembershipRequest';
import { CommunityRequestNotFoundError } from '@app/contexts/communities/domain/errors/CommunityRequestNotFoundError';
import { CommunityModerationAction } from '@app/contexts/communities/domain/value-objects/CommunityModerationAction';
import { CommunityModerationTargetType } from '@app/contexts/communities/domain/value-objects/CommunityModerationTargetType';
import { CommunityRequestId } from '@app/contexts/communities/domain/value-objects/CommunityRequestId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import {
  Body,
  JsonController,
  Param,
  Patch,
  Req,
  Res,
} from 'routing-controllers';

import { PatchCommunityMembershipRequestBody } from '../bodies/PatchCommunityMembershipRequestBody';
import { CommunityMembershipRequestViewModel } from '../view-model/CommunityMembershipRequestViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class PatchCommunityRequestRoute extends CommunityRouteSupport {
  private async acceptRequest(
    membershipRequest: CommunityMembershipRequest,
    community: Community,
    actorIdentityId: IdentityId,
  ): Promise<void> {
    if (membershipRequest.isRequest()) {
      community.assertCanApproveMembers(actorIdentityId);
    }

    membershipRequest.accept(
      actorIdentityId,
      membershipRequest.isRequest()
        ? actorIdentityId
        : community.getOwnerIdentityId(),
    );
    community.joinWithInvite(membershipRequest.getIdentityId());
    await this.repository().save(community);
    await this.eventPublisher.publish(community.pullDomainEvents());
  }

  private declineRequest(
    membershipRequest: CommunityMembershipRequest,
    community: Community,
    actorIdentityId: IdentityId,
  ): void {
    if (membershipRequest.isRequest()) {
      community.assertCanRejectMembers(actorIdentityId);
    }

    membershipRequest.decline(
      actorIdentityId,
      membershipRequest.isRequest()
        ? actorIdentityId
        : community.getOwnerIdentityId(),
    );
  }

  @Patch('/membership-requests/:requestId')
  public async updateMembershipRequest(
    @Param('requestId') requestId: string,
    @Body() body: PatchCommunityMembershipRequestBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const membershipRequest = await this.membershipRequests().findById(
      new CommunityRequestId(requestId),
    );

    if (!membershipRequest) {
      throw new CommunityRequestNotFoundError();
    }

    const community = await this.findCommunity(
      membershipRequest.getCommunityId().valueOf(),
    );

    if (body.status === 'accepted') {
      await this.acceptRequest(membershipRequest, community, actorIdentityId);
    } else {
      this.declineRequest(membershipRequest, community, actorIdentityId);
    }

    await this.membershipRequests().save(membershipRequest);
    await this.eventPublisher.publish(membershipRequest.pullDomainEvents());
    await this.recordModerationLog(
      community,
      actorIdentityId,
      body.status === 'accepted'
        ? CommunityModerationAction.MEMBERSHIP_REQUEST_ACCEPTED
        : CommunityModerationAction.MEMBERSHIP_REQUEST_DECLINED,
      this.moderationTarget(
        CommunityModerationTargetType.MEMBERSHIP_REQUEST,
        membershipRequest.getId(),
      ),
      {
        identityId: membershipRequest.getIdentityId().valueOf(),
        type: membershipRequest.toPrimitives().type,
      },
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(
        new CommunityMembershipRequestViewModel(membershipRequest).toResource(),
      );
  }
}
