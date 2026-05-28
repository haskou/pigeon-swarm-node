import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '@app/contexts/communities/domain/value-objects/CommunityChannelMessageId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { MongoPollRepository } from '@app/contexts/polls/infrastructure/mongo/MongoPollRepository';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
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
  private pollRepository(): MongoPollRepository {
    return new MongoPollRepository(this.get<MongoDB>(MongoDB));
  }

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

    community.assertCanViewTextChannel(actorIdentityId, communityChannelId);

    const messages = await this.messageRepository().findByChannel(
      new CommunityId(communityId),
      communityChannelId,
      safeLimit,
      beforeMessageId
        ? new CommunityChannelMessageId(beforeMessageId)
        : undefined,
    );
    const reactions = await this.reactions().findByMessageIds(
      new CommunityId(communityId),
      communityChannelId,
      messages.map(
        (message) => new CommunityChannelMessageId(message.toPrimitives().id),
      ),
    );
    const upperBound = messages.at(-1)?.toPrimitives().createdAt;
    const polls =
      beforeMessageId && messages.length === 0
        ? []
        : await this.pollRepository().findByCommunityChannel(
            new CommunityId(communityId),
            communityChannelId,
            safeLimit,
            beforeMessageId ? upperBound : undefined,
          );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(
        new CommunityChannelMessagesViewModel(
          communityId,
          channelId,
          messages,
          reactions,
          polls,
          safeLimit,
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
    const community = await this.findCommunity(communityId);
    const communityChannelId = new CommunityChannelId(channelId);
    const safeLimit = Math.min(Math.max(limit ?? 50, 1), 100);

    community.assertCanViewTextChannel(actorIdentityId, communityChannelId);

    const messages = await this.messageRepository().findThreadMessages(
      new CommunityId(communityId),
      communityChannelId,
      new CommunityChannelMessageId(messageId),
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
