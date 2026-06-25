import CommunitiesDiscoverer from '@app/contexts/communities/application/discover-communities/CommunitiesDiscoverer';
import { CommunitiesDiscoverMessage } from '@app/contexts/communities/application/discover-communities/messages/CommunitiesDiscoverMessage';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Get, JsonController, QueryParam, Req, Res } from 'routing-controllers';

import { CommunityDiscoveryViewModel } from '../view-model/CommunityDiscoveryViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class GetCommunityDiscoveryRoute extends CommunityRouteSupport {
  private readonly discoverer = this.get<CommunitiesDiscoverer>(
    CommunitiesDiscoverer,
  );

  @Get('/discover')
  public async discoverCommunities(
    @QueryParam('query') query: string | undefined,
    @QueryParam('networkId') networkId: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId = await this.authenticate(request);
    const discovery = await this.discoverer.discover(
      new CommunitiesDiscoverMessage(identityId.valueOf(), networkId, query),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(
        new CommunityDiscoveryViewModel(
          discovery.getCommunities(),
          identityId,
          discovery.getMembershipRequests(),
        ).toResource(),
      );
  }
}
