import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import { Get, JsonController, QueryParam, Req, Res } from 'routing-controllers';

import { CommunityDiscoveryViewModel } from '../view-model/CommunityDiscoveryViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class GetCommunityDiscoveryRoute extends CommunityRouteSupport {
  @Get('/discover')
  public async discoverCommunities(
    @QueryParam('query') query: string | undefined,
    @QueryParam('networkId') networkId: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId = await this.authenticate(request);
    const [communities, membershipRequests] = await Promise.all([
      this.repository().findDiscoverable({ networkId, query }),
      this.membershipRequests().findByIdentity(identityId),
    ]);

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(
        new CommunityDiscoveryViewModel(
          communities,
          identityId,
          membershipRequests,
        ).toResource(),
      );
  }
}
