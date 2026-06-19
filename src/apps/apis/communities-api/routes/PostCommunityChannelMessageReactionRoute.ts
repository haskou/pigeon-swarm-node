import { CommunityChannelMessageReactionBody } from '@app/apps/apis/communities-api/bodies/CommunityChannelMessageReactionBody';
import { CommunityChannelMessageReactionWasAddedEvent } from '@app/contexts/communities/domain/events/CommunityChannelMessageReactionWasAddedEvent';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import {
  Body,
  JsonController,
  Param,
  Post,
  Req,
  Res,
} from 'routing-controllers';

import { CommunityChannelMessageReactionViewModel } from '../view-model/CommunityChannelMessageReactionViewModel';
import { CommunityChannelMessageReactionRouteSupport } from './CommunityChannelMessageReactionRouteSupport';

@JsonController('/communities')
// eslint-disable-next-line max-len
export class PostCommunityChannelMessageReactionRoute extends CommunityChannelMessageReactionRouteSupport {
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
        community: communityPrimitives,
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
