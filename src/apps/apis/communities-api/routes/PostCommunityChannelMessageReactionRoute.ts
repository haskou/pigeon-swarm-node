import { CommunityChannelMessageReactionBody } from '@app/apps/apis/communities-api/bodies/CommunityChannelMessageReactionBody';
import CommunityChannelMessageReactionAdder from '@app/contexts/communities/application/react-channel-message/CommunityChannelMessageReactionAdder';
import { CommunityChannelMessageReactionChangeMessage } from '@app/contexts/communities/application/react-channel-message/messages/CommunityChannelMessageReactionChangeMessage';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
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
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class PostCommunityChannelMessageReactionRoute extends CommunityRouteSupport {
  private readonly adder = this.get<CommunityChannelMessageReactionAdder>(
    CommunityChannelMessageReactionAdder,
  );

  @Post('/:communityId/channels/:channelId/messages/:messageId/reactions')
  public async addReaction(
    @Param('communityId') communityId: string,
    @Param('channelId') channelId: string,
    @Param('messageId') messageId: string,
    @Body() body: CommunityChannelMessageReactionBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const reaction = await this.adder.add(
      new CommunityChannelMessageReactionChangeMessage(
        communityId,
        channelId,
        messageId,
        actorIdentityId.valueOf(),
        body.emoji,
      ),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(
        new CommunityChannelMessageReactionViewModel(reaction).toResource(),
      );
  }
}
