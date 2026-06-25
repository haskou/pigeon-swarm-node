import CommunityChannelMessagesFinder from '@app/contexts/communities/application/find-channel-messages/CommunityChannelMessagesFinder';
import { CommunityChannelMessagesFindMessage } from '@app/contexts/communities/application/find-channel-messages/messages/CommunityChannelMessagesFindMessage';
import { CommunityChannelThreadMessagesFindMessage } from '@app/contexts/communities/application/find-channel-messages/messages/CommunityChannelThreadMessagesFindMessage';
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
export class GetCommunityChannelMessagesRoute extends CommunityRouteSupport {
  private readonly finder = this.get<CommunityChannelMessagesFinder>(
    CommunityChannelMessagesFinder,
  );

  @Get('/:communityId/channels/:channelId/messages')
  public async getMessages(
    @Param('communityId') communityId: string,
    @Param('channelId') channelId: string,
    @QueryParam('limit') limit: number | undefined,
    @QueryParam('beforeMessageId') beforeMessageId: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const page = await this.finder.find(
      new CommunityChannelMessagesFindMessage(
        communityId,
        channelId,
        actorIdentityId.valueOf(),
        limit,
        beforeMessageId,
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
          page.getPolls(),
          page.getLimit(),
        ).toResource(),
      );
  }

  @Get('/:communityId/channels/:channelId/messages/:messageId/thread')
  public async getThreadMessages(
    @Param('communityId') communityId: string,
    @Param('channelId') channelId: string,
    @Param('messageId') messageId: string,
    @QueryParam('limit') limit: number | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const page = await this.finder.findThread(
      new CommunityChannelThreadMessagesFindMessage(
        communityId,
        channelId,
        messageId,
        actorIdentityId.valueOf(),
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
          page.getPolls(),
          page.getLimit(),
        ).toResource(),
      );
  }
}
