import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import { Get, JsonController, Param, Req, Res } from 'routing-controllers';

import { CommunityChannelsViewModel } from '../view-model/CommunityChannelsViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class GetCommunityChannelsRoute extends CommunityRouteSupport {
  @Get('/:communityId/channels')
  public async getChannels(
    @Param('communityId') communityId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const community = await this.findCommunity(communityId);

    community.assertIsMember(actorIdentityId);

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new CommunityChannelsViewModel(community).toResource());
  }
}
