import { PageCursor } from '@app/apps/apis/shared/pagination/PageCursor';
import CommunityChannelMessagesFinder from '@app/contexts/communities/application/find-channel-messages/CommunityChannelMessagesFinder';
import { CommunityChannelMessagesFindMessage } from '@app/contexts/communities/application/find-channel-messages/messages/CommunityChannelMessagesFindMessage';
import { CommunityChannelThreadMessagesFindMessage } from '@app/contexts/communities/application/find-channel-messages/messages/CommunityChannelThreadMessagesFindMessage';
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
export class GetCommunityChannelMessagesRoute extends CommunityRouteSupport {
  private readonly finder = this.get<CommunityChannelMessagesFinder>(
    CommunityChannelMessagesFinder,
  );

  private readonly searchFinder = this.get<CommunityChannelMessageSearchFinder>(
    CommunityChannelMessageSearchFinder,
  );

  private async search(
    communityId: string,
    channelId: string,
    actorIdentityId: string,
    query: string,
    limit: number | undefined,
  ): Promise<CommunityChannelMessagesViewModel> {
    const page = await this.searchFinder.find(
      new CommunityChannelMessageSearchMessage(
        communityId,
        channelId,
        actorIdentityId,
        query,
        limit,
      ),
    );

    return new CommunityChannelMessagesViewModel(
      communityId,
      channelId,
      page.getMessages(),
      page.getReactions(),
      [],
      page.getLimit(),
    );
  }

  @Get('/:communityId/channels/:channelId/messages')
  public async getMessages(
    @Param('communityId') communityId: string,
    @Param('channelId') channelId: string,
    @QueryParam('limit') limit: number | undefined,
    @QueryParam('cursor') cursor: string | undefined,
    @QueryParam('query') query: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);

    if (query !== undefined) {
      const found = await this.search(
        communityId,
        channelId,
        actorIdentityId.valueOf(),
        query,
        limit,
      );

      return response.status(HttpRouteStatusEnum.OK).send(found.toResource());
    }

    const resource = `communities/${communityId}/channels/${channelId}/messages`;
    const caller = actorIdentityId.valueOf();
    const page = await this.finder.find(
      new CommunityChannelMessagesFindMessage(
        communityId,
        channelId,
        caller,
        limit,
        cursor === undefined
          ? undefined
          : PageCursor.decode(cursor, { caller, resource }),
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
          (position) => PageCursor.encode({ caller, position, resource }),
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
