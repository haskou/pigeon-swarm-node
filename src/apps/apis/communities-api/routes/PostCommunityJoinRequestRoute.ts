import CommunityMembershipRequester from '@app/contexts/communities/application/request-membership/CommunityMembershipRequester';
import { CommunityMembershipRequestCreateMessage } from '@app/contexts/communities/application/request-membership/messages/CommunityMembershipRequestCreateMessage';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Body, JsonController, Post, Req, Res } from 'routing-controllers';

import { PostCommunityJoinRequestBody } from '../bodies/PostCommunityJoinRequestBody';
import { CommunityMembershipRequestViewModel } from '../view-model/CommunityMembershipRequestViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/community-membership-requests')
export class PostCommunityJoinRequestRoute extends CommunityRouteSupport {
  private readonly requester = this.get<CommunityMembershipRequester>(
    CommunityMembershipRequester,
  );

  @Post()
  public async requestJoin(
    @Body() body: PostCommunityJoinRequestBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const membershipRequest = await this.requester.request(
      new CommunityMembershipRequestCreateMessage(
        body.communityId,
        actorIdentityId.valueOf(),
        body.createdAt,
        body.mutation,
        body.acceptedAt,
        body.acceptedMutation,
        body.operation,
      ),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(
        new CommunityMembershipRequestViewModel(membershipRequest).toResource(),
      );
  }
}
