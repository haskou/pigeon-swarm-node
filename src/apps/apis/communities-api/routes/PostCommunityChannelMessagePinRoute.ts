import CommunityChannelMessagePinner from '@app/contexts/communities/application/manage-channel-message-pin/CommunityChannelMessagePinner';
import { CommunityChannelMessagePinCreateMessage } from '@app/contexts/communities/application/manage-channel-message-pin/messages/CommunityChannelMessagePinCreateMessage';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { JsonController, Param, Post, Req, Res } from 'routing-controllers';

import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class PostCommunityChannelMessagePinRoute extends CommunityRouteSupport {
  private readonly pinner = this.get<CommunityChannelMessagePinner>(
    CommunityChannelMessagePinner,
  );

  @Post('/:communityId/channels/:channelId/messages/:messageId/pin')
  public async pinMessage(
    @Param('communityId') communityId: string,
    @Param('channelId') channelId: string,
    @Param('messageId') messageId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    await this.pinner.pin(
      new CommunityChannelMessagePinCreateMessage(
        actorIdentityId.valueOf(),
        communityId,
        channelId,
        messageId,
      ),
    );

    return response.status(HttpRouteStatusEnum.OK).send({
      channelId,
      communityId,
      messageId,
      pinnedByIdentityId: actorIdentityId.valueOf(),
    });
  }
}
