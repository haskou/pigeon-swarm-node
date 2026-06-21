import CommunityChannelsFinder from '@app/contexts/communities/application/find-channels/CommunityChannelsFinder';
import { CommunityChannelsFindMessage } from '@app/contexts/communities/application/find-channels/messages/CommunityChannelsFindMessage';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import { Get, JsonController, Param, Req, Res } from 'routing-controllers';

import { CommunityChannelsViewModel } from '../view-model/CommunityChannelsViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class GetCommunityChannelsRoute extends CommunityRouteSupport {
  private readonly finder = this.get<CommunityChannelsFinder>(
    CommunityChannelsFinder,
  );

  @Get('/:communityId/channels')
  public async getChannels(
    @Param('communityId') communityId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const details = await this.finder.find(
      new CommunityChannelsFindMessage(communityId, actorIdentityId.valueOf()),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(
        new CommunityChannelsViewModel(
          details.getCommunity(),
          details.getActorIdentityId(),
          details.getConnectedIdentityIdsByChannelId(),
          details.getThreadSummariesByChannelId(),
        ).toResource(),
      );
  }
}
