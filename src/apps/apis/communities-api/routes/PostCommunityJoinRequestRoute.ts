import CommunityMembershipRequester from '@app/contexts/communities/application/request-membership/CommunityMembershipRequester';
import { CommunityMembershipRequestCreateMessage } from '@app/contexts/communities/application/request-membership/messages/CommunityMembershipRequestCreateMessage';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import { JsonController, Param, Post, Req, Res } from 'routing-controllers';

import { CommunityMembershipRequestViewModel } from '../view-model/CommunityMembershipRequestViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class PostCommunityJoinRequestRoute extends CommunityRouteSupport {
  private readonly requester = this.get<CommunityMembershipRequester>(
    CommunityMembershipRequester,
  );

  @Post('/:communityId/join-requests')
  public async requestJoin(
    @Param('communityId') communityId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const membershipRequest = await this.requester.request(
      new CommunityMembershipRequestCreateMessage(
        communityId,
        actorIdentityId.valueOf(),
      ),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(
        new CommunityMembershipRequestViewModel(membershipRequest).toResource(),
      );
  }
}
