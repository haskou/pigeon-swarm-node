import { CommunityChannelMessageReactionBody } from '@app/apps/apis/communities-api/bodies/CommunityChannelMessageReactionBody';
import { CommunityChannelMessageReaction } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessageReaction';
import { CommunityChannelMessageNotFoundError } from '@app/contexts/communities/domain/errors/CommunityChannelMessageNotFoundError';
import { CommunityChannelMessageReactionWasAddedEvent } from '@app/contexts/communities/domain/events/CommunityChannelMessageReactionWasAddedEvent';
import { CommunityChannelMessageReactionRemovedEvent } from '@app/contexts/communities/domain/events/CommunityChannelMessageReactionWasRemovedEvent';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '@app/contexts/communities/domain/value-objects/CommunityChannelMessageId';
import { CommunityChannelMessageReactionEmoji } from '@app/contexts/communities/domain/value-objects/CommunityChannelMessageReactionEmoji';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { assert } from '@haskou/value-objects';
import { Request, Response } from 'express';
import {
  Body,
  Delete,
  JsonController,
  Param,
  Post,
  Req,
  Res,
} from 'routing-controllers';

import { CommunityChannelMessageReactionViewModel } from '../view-model/CommunityChannelMessageReactionViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class CommunityMessageReactionRoute extends CommunityRouteSupport {
  private async persistReaction(
    communityId: string,
    channelId: string,
    messageId: string,
    body: CommunityChannelMessageReactionBody,
    request: Request,
  ): Promise<CommunityChannelMessageReaction> {
    const reaction = await this.buildReaction(
      communityId,
      channelId,
      messageId,
      body,
      request,
    );

    await this.reactions().save(reaction);

    return reaction;
  }

  private async buildReaction(
    communityId: string,
    channelId: string,
    messageId: string,
    body: CommunityChannelMessageReactionBody,
    request: Request,
  ): Promise<CommunityChannelMessageReaction> {
    const authorIdentityId = await this.authenticate(request);
    const community = await this.findCommunity(communityId);
    const communityChannelId = new CommunityChannelId(channelId);
    const communityMessageId = new CommunityChannelMessageId(messageId);

    community.assertCanReactWithSticker(authorIdentityId, communityChannelId);
    assert(
      await this.messageRepository().findById(
        new CommunityId(communityId),
        communityChannelId,
        communityMessageId,
      ),
      new CommunityChannelMessageNotFoundError(),
    );

    return CommunityChannelMessageReaction.create(
      new CommunityId(communityId),
      communityChannelId,
      communityMessageId,
      authorIdentityId,
      new CommunityChannelMessageReactionEmoji(body.emoji),
    );
  }

  @Post('/:communityId/channels/:channelId/messages/:messageId/reactions')
  public async addReaction(
    @Param('communityId') communityId: string,
    @Param('channelId') channelId: string,
    @Param('messageId') messageId: string,
    @Body() body: CommunityChannelMessageReactionBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const reaction = await this.persistReaction(
      communityId,
      channelId,
      messageId,
      body,
      request,
    );
    const community = await this.findCommunity(communityId);
    const communityPrimitives = community.toPrimitives();

    await this.eventPublisher.publish([
      new CommunityChannelMessageReactionWasAddedEvent(communityId, {
        ...reaction.toPrimitives(),
        memberIds: communityPrimitives.memberIds,
        networkId: communityPrimitives.networkId,
      }),
    ]);

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(
        new CommunityChannelMessageReactionViewModel(reaction).toResource(),
      );
  }

  @Delete('/:communityId/channels/:channelId/messages/:messageId/reactions')
  public async removeReaction(
    @Param('communityId') communityId: string,
    @Param('channelId') channelId: string,
    @Param('messageId') messageId: string,
    @Body() body: CommunityChannelMessageReactionBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const reaction = await this.buildReaction(
      communityId,
      channelId,
      messageId,
      body,
      request,
    );
    const community = await this.findCommunity(communityId);
    const communityPrimitives = community.toPrimitives();

    await this.reactions().delete(reaction);
    await this.eventPublisher.publish([
      new CommunityChannelMessageReactionRemovedEvent(communityId, {
        ...reaction.toPrimitives(),
        memberIds: communityPrimitives.memberIds,
        networkId: communityPrimitives.networkId,
      }),
    ]);

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(
        new CommunityChannelMessageReactionViewModel(reaction).toResource(),
      );
  }
}
