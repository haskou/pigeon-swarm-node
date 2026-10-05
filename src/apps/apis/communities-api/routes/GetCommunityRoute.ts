import CommunityFinder from '@app/contexts/communities/application/find-community/CommunityFinder';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Get, JsonController, Param, Req, Res } from 'routing-controllers';

import { CommunityViewModel } from '../view-model/CommunityViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class GetCommunityRoute extends CommunityRouteSupport {
  private readonly finder = this.get<CommunityFinder>(CommunityFinder);

  @Get('/:communityId')
  public async getCommunity(
    @Param('communityId') communityId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId = await this.authenticate(request);
    const community = await this.findCommunity(communityId);

    community.viewAsMember(identityId);

    return response.status(HttpRouteStatusEnum.OK).send({
      ...new CommunityViewModel(community).toResource(),
      frontier: await this.finder.findFrontier(new CommunityId(communityId)),
    });
  }
}
