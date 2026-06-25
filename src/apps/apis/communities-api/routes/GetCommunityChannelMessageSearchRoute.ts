import CommunityChannelMessageSearchFinder from '@app/contexts/communities/application/search-channel-messages/CommunityChannelMessageSearchFinder';
import { CommunityChannelMessageSearchMessage } from '@app/contexts/communities/application/search-channel-messages/messages/CommunityChannelMessageSearchMessage';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import {
  Get,
  JsonController,
  Param,
  QueryParam,
  Req,
  Res,
} from 'routing-controllers';

import { CommunityChannelMessagesViewModel } from '../view-model/CommunityChannelMessagesViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class GetCommunityChannelMessageSearchRoute extends CommunityRouteSupport {
  private readonly finder = this.get<CommunityChannelMessageSearchFinder>(
    CommunityChannelMessageSearchFinder,
  );

  @Get('/:communityId/channels/:channelId/messages/search')
  public async searchMessages(
    @Param('communityId') communityId: string,
    @Param('channelId') channelId: string,
    @QueryParam('query') query: string | undefined,
    @QueryParam('limit') limit: number | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const page = await this.finder.find(
      new CommunityChannelMessageSearchMessage(
        communityId,
        channelId,
        actorIdentityId.valueOf(),
        query,
        limit,
      ),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(
        new CommunityChannelMessagesViewModel(
          communityId,
          channelId,
          page.getMessages(),
          page.getReactions(),
          [],
          page.getLimit(),
        ).toResource(),
      );
  }
}
