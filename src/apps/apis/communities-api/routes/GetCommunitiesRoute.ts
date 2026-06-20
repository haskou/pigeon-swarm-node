import CommunitiesFinder from '@app/contexts/communities/application/find-communities/CommunitiesFinder';
import { CommunitiesFindMessage } from '@app/contexts/communities/application/find-communities/messages/CommunitiesFindMessage';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import { Get, JsonController, Req, Res } from 'routing-controllers';

import { CommunitiesViewModel } from '../view-model/CommunitiesViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class GetCommunitiesRoute extends CommunityRouteSupport {
  private readonly finder = this.get<CommunitiesFinder>(CommunitiesFinder);

  @Get('/')
  public async getCommunities(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId = await this.authenticate(request);
    const communities = await this.finder.find(
      new CommunitiesFindMessage(identityId.valueOf()),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new CommunitiesViewModel(communities).toResource());
  }
}
