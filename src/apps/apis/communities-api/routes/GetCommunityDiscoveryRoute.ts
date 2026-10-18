import { PageCursor } from '@app/apps/apis/shared/pagination/PageCursor';
import CommunitiesDiscoverer from '@app/contexts/communities/application/discover-communities/CommunitiesDiscoverer';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Get, JsonController, QueryParam, Req, Res } from 'routing-controllers';

import { GetCommunityDiscoveryRequest } from '../requests/GetCommunityDiscoveryRequest';
import { CommunityDiscoveryViewModel } from '../view-model/CommunityDiscoveryViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/discoverable-communities')
export class GetCommunityDiscoveryRoute extends CommunityRouteSupport {
  private readonly discoverer = this.get<CommunitiesDiscoverer>(
    CommunitiesDiscoverer,
  );

  @Get()
  public async discoverCommunities(
    @QueryParam('query') query: string | undefined,
    @QueryParam('networkId') networkId: string | undefined,
    @QueryParam('limit') limit: string | undefined,
    @QueryParam('cursor') cursor: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId = await this.authenticate(request);
    const pageRequest = new GetCommunityDiscoveryRequest(
      identityId.valueOf(),
      networkId,
      query,
      cursor,
      limit,
    );
    const discovery = await this.discoverer.discover(pageRequest.getMessage());
    const nextPosition = discovery.getNextPosition();

    return response.status(HttpRouteStatusEnum.OK).send(
      new CommunityDiscoveryViewModel(
        discovery.getCommunities(),
        identityId,
        discovery.getMembershipRequests(),
        nextPosition === undefined
          ? null
          : PageCursor.encode({
              position: nextPosition,
              resource: pageRequest.scope(),
            }),
      ).toResource(),
    );
  }
}
