import CommunityChannelMessageUnpinner from '@app/contexts/communities/application/manage-channel-message-pin/CommunityChannelMessageUnpinner';
import { CommunityChannelMessagePinDeleteMessage } from '@app/contexts/communities/application/manage-channel-message-pin/messages/CommunityChannelMessagePinDeleteMessage';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import {
  Body,
  Delete,
  JsonController,
  Param,
  Req,
  Res,
} from 'routing-controllers';

import { DeleteCommunityChannelMessagePinBody } from '../bodies/DeleteCommunityChannelMessagePinBody';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class DeleteCommunityChannelMessagePinRoute extends CommunityRouteSupport {
  private readonly unpinner = this.get<CommunityChannelMessageUnpinner>(
    CommunityChannelMessageUnpinner,
  );

  @Delete('/:communityId/channels/:channelId/messages/:messageId/pin')
  public async unpinMessage(
    @Param('communityId') communityId: string,
    @Param('channelId') channelId: string,
    @Param('messageId') messageId: string,
    @Body() body: DeleteCommunityChannelMessagePinBody,
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
        body.mutation,
      ),
    );

    return response.status(HttpRouteStatusEnum.OK).send({
      channelId,
      communityId,
      messageId,
    });
  }
}
