import CommunityFinder from '@app/contexts/communities/application/find-community/CommunityFinder';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Get, JsonController, Param, Req, Res } from 'routing-controllers';

import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class GetCommunityFrontierRoute extends CommunityRouteSupport {
  private readonly finder = this.get<CommunityFinder>(CommunityFinder);

  @Get('/:communityId/frontier')
  public async getCommunityFrontier(
    @Param('communityId') communityId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    this.authenticate(request);
    await this.findCommunity(communityId);

    return response.status(HttpRouteStatusEnum.OK).send({
      frontier: await this.finder.findFrontier(new CommunityId(communityId)),
    });
  }
}
