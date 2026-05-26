import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '@app/contexts/communities/domain/value-objects/CommunityChannelMessageId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
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
import { CommunityMessageSearchViewModel } from '../view-model/CommunityMessageSearchViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class SearchCommunityChannelMessagesRoute extends CommunityRouteSupport {
  @Get('/:communityId/messages/search')
  public async searchCommunityMessages(
    @Param('communityId') communityId: string,
    @QueryParam('query') query: string | undefined,
    @QueryParam('limit') limit: number | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const community = await this.findCommunity(communityId);
    const safeLimit = Math.min(Math.max(limit ?? 20, 1), 50);
    const visibleTextChannelIds =
      community.visibleTextChannelIdsFor(actorIdentityId);

    community.assertCanSearchMessages();

    const messages = await this.messageRepository().searchPublicByChannels(
      new CommunityId(communityId),
      visibleTextChannelIds,
      query ?? '',
      safeLimit,
    );
    const reactions = await this.reactions().findByMessageIdsInChannels(
      new CommunityId(communityId),
      visibleTextChannelIds,
      messages.map(
        (message) => new CommunityChannelMessageId(message.toPrimitives().id),
      ),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(
        new CommunityMessageSearchViewModel(
          communityId,
          messages,
          reactions,
        ).toResource(),
      );
  }

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
    const community = await this.findCommunity(communityId);
    const communityChannelId = new CommunityChannelId(channelId);
    const safeLimit = Math.min(Math.max(limit ?? 20, 1), 50);

    community.assertCanViewTextChannel(actorIdentityId, communityChannelId);
    community.assertCanSearchMessages();

    const messages = await this.messageRepository().searchPublicByChannel(
      new CommunityId(communityId),
      communityChannelId,
      query ?? '',
      safeLimit,
    );
    const reactions = await this.reactions().findByMessageIds(
      new CommunityId(communityId),
      communityChannelId,
      messages.map(
        (message) => new CommunityChannelMessageId(message.toPrimitives().id),
      ),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(
        new CommunityChannelMessagesViewModel(
          communityId,
          channelId,
          messages,
          reactions,
          [],
          safeLimit,
        ).toResource(),
      );
  }
}
