import { CommunityMembershipRequest } from '@app/contexts/communities/domain/entities/membership/CommunityMembershipRequest';
import { CommunityModerationAction } from '@app/contexts/communities/domain/value-objects/CommunityModerationAction';
import { CommunityModerationTargetType } from '@app/contexts/communities/domain/value-objects/CommunityModerationTargetType';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import {
  Body,
  JsonController,
  Param,
  Post,
  Req,
  Res,
} from 'routing-controllers';

import { PostCommunityMemberBody } from '../bodies/PostCommunityMemberBody';
import { CommunityMembershipRequestViewModel } from '../view-model/CommunityMembershipRequestViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class PostCommunityMemberRoute extends CommunityRouteSupport {
  @Post('/:communityId/members')
  public async addMember(
    @Param('communityId') communityId: string,
    @Body() body: PostCommunityMemberBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const community = await this.findCommunity(communityId);
    const invitedIdentityId = new IdentityId(body.identityId);

    community.assertCanCreateInvite(actorIdentityId);

    const requests = this.membershipRequests();
    const existingRequests = await requests.findByCommunityAndIdentity(
      community.getId(),
      invitedIdentityId,
    );
    const pendingRequest = existingRequests.find((existingRequest) =>
      existingRequest.isPending(),
    );

    if (pendingRequest) {
      return response
        .status(HttpRouteStatusEnum.OK)
        .send(
          new CommunityMembershipRequestViewModel(pendingRequest).toResource(),
        );
    }

    const membershipRequest = CommunityMembershipRequest.invitation(
      community.getId(),
      actorIdentityId,
      invitedIdentityId,
      community.getOwnerIdentityId(),
    );

    await requests.save(membershipRequest);
    await this.eventPublisher.publish(membershipRequest.pullDomainEvents());
    await this.recordModerationLog(
      community,
      actorIdentityId,
      CommunityModerationAction.INVITATION_CREATED,
      this.moderationTarget(
        CommunityModerationTargetType.MEMBERSHIP_REQUEST,
        membershipRequest.getId(),
      ),
      { identityId: invitedIdentityId.valueOf() },
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(
        new CommunityMembershipRequestViewModel(membershipRequest).toResource(),
      );
  }
}
