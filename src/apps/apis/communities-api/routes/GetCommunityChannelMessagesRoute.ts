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
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class GetCommunityChannelMessagesRoute extends CommunityRouteSupport {
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
    const community = await this.findCommunity(communityId);
    const communityChannelId = new CommunityChannelId(channelId);
    const safeLimit = Math.min(Math.max(limit ?? 50, 1), 100);

    community.assertIsMember(actorIdentityId);
    community.assertHasTextChannel(communityChannelId);

    const messages = await this.messageRepository().findByChannel(
      new CommunityId(communityId),
      communityChannelId,
      safeLimit,
      beforeMessageId
        ? new CommunityChannelMessageId(beforeMessageId)
        : undefined,
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(
        new CommunityChannelMessagesViewModel(
          communityId,
          channelId,
          messages,
        ).toResource(),
      );
  }
}
