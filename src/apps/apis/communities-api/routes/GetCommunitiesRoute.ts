import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import { Get, JsonController, Req, Res } from 'routing-controllers';

import { CommunitiesViewModel } from '../view-model/CommunitiesViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class GetCommunitiesRoute extends CommunityRouteSupport {
  @Get('/')
  public async getCommunities(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId = await this.authenticate(request);
    const communities = await this.repository().findByMember(identityId);

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new CommunitiesViewModel(communities).toResource());
  }
}
