import { CommunityChannelMessageReactionBody } from '@app/apps/apis/communities-api/bodies/CommunityChannelMessageReactionBody';
import { CommunityChannelMessageReactionRemovedEvent } from '@app/contexts/communities/domain/events/CommunityChannelMessageReactionWasRemovedEvent';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import {
  Body,
  Delete,
  JsonController,
  Param,
  Req,
  Res,
} from 'routing-controllers';

import { CommunityChannelMessageReactionViewModel } from '../view-model/CommunityChannelMessageReactionViewModel';
import { CommunityChannelMessageReactionRouteSupport } from './CommunityChannelMessageReactionRouteSupport';

@JsonController('/communities')
// eslint-disable-next-line max-len
export class DeleteCommunityChannelMessageReactionRoute extends CommunityChannelMessageReactionRouteSupport {
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
