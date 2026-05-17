import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import { Get, JsonController, Req, Res } from 'routing-controllers';

import { CommunityMembershipRequestsViewModel } from '../view-model/CommunityMembershipRequestsViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class GetCommunityMembershipRequestsRoute extends CommunityRouteSupport {
  @Get('/membership-requests')
  public async getMembershipRequests(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId = await this.authenticate(request);
    const [identityRequests, ownedCommunityRequests] = await Promise.all([
      this.membershipRequests().findByIdentity(identityId),
      this.membershipRequests().findByOwnedCommunities(identityId),
    ]);
    const requestsById = new Map(
      [...identityRequests, ...ownedCommunityRequests].map(
        (membershipRequest) => [
          membershipRequest.getId().valueOf(),
          membershipRequest,
        ],
      ),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(
        new CommunityMembershipRequestsViewModel([
          ...requestsById.values(),
        ]).toResource(),
      );
  }
}
