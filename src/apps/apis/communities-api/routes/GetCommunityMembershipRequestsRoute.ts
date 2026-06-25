import CommunityMembershipRequestsFinder from '@app/contexts/communities/application/find-membership-requests/CommunityMembershipRequestsFinder';
import { CommunityMembershipRequestsFindMessage } from '@app/contexts/communities/application/find-membership-requests/messages/CommunityMembershipRequestsFindMessage';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Get, JsonController, Req, Res } from 'routing-controllers';

import { CommunityMembershipRequestsViewModel } from '../view-model/CommunityMembershipRequestsViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class GetCommunityMembershipRequestsRoute extends CommunityRouteSupport {
  private readonly finder = this.get<CommunityMembershipRequestsFinder>(
    CommunityMembershipRequestsFinder,
  );

  @Get('/membership-requests')
  public async getMembershipRequests(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId = await this.authenticate(request);
    const membershipRequests = await this.finder.find(
      new CommunityMembershipRequestsFindMessage(identityId.valueOf()),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(
        new CommunityMembershipRequestsViewModel(
          membershipRequests,
        ).toResource(),
      );
  }
}
