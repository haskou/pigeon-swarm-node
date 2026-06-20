import CommunityChannelMessageSearcher from '@app/contexts/communities/application/search-channel-messages/CommunityChannelMessageSearcher';
import { CommunityChannelMessageSearchMessage } from '@app/contexts/communities/application/search-channel-messages/messages/CommunityChannelMessageSearchMessage';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
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
// eslint-disable-next-line max-len
export class GetCommunityChannelMessageSearchRoute extends CommunityRouteSupport {
  private readonly searcher = this.get<CommunityChannelMessageSearcher>(
    CommunityChannelMessageSearcher,
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
    const page = await this.searcher.search(
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
