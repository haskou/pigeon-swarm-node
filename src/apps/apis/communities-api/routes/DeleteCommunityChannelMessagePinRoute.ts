import CommunityChannelMessageUnpinner from '@app/contexts/communities/application/manage-channel-message-pin/CommunityChannelMessageUnpinner';
import { CommunityChannelMessagePinDeleteMessage } from '@app/contexts/communities/application/manage-channel-message-pin/messages/CommunityChannelMessagePinDeleteMessage';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import { Delete, JsonController, Param, Req, Res } from 'routing-controllers';

import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
// eslint-disable-next-line max-len
export class DeleteCommunityChannelMessagePinRoute extends CommunityRouteSupport {
  private readonly unpinner = this.get<CommunityChannelMessageUnpinner>(
    CommunityChannelMessageUnpinner,
  );

  @Delete('/:communityId/channels/:channelId/messages/:messageId/pin')
  public async unpinMessage(
    @Param('communityId') communityId: string,
    @Param('channelId') channelId: string,
    @Param('messageId') messageId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    await this.unpinner.unpin(
      new CommunityChannelMessagePinDeleteMessage(
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
    });
  }
}
