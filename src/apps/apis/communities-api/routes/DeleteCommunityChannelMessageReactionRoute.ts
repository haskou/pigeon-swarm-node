import { CommunityChannelMessageReactionBody } from '@app/apps/apis/communities-api/bodies/CommunityChannelMessageReactionBody';
import CommunityChannelMessageReactionRemover from '@app/contexts/communities/application/react-channel-message/CommunityChannelMessageReactionRemover';
import { CommunityChannelMessageReactionChangeMessage } from '@app/contexts/communities/application/react-channel-message/messages/CommunityChannelMessageReactionChangeMessage';
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
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
// eslint-disable-next-line max-len
export class DeleteCommunityChannelMessageReactionRoute extends CommunityRouteSupport {
  private readonly remover = this.get<CommunityChannelMessageReactionRemover>(
    CommunityChannelMessageReactionRemover,
  );

  @Delete('/:communityId/channels/:channelId/messages/:messageId/reactions')
  public async removeReaction(
    @Param('communityId') communityId: string,
    @Param('channelId') channelId: string,
    @Param('messageId') messageId: string,
    @Body() body: CommunityChannelMessageReactionBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const reaction = await this.remover.remove(
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
