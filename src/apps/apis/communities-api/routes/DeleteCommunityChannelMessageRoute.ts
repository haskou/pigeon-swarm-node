import { DeleteCommunityChannelMessageBody } from '@app/apps/apis/communities-api/bodies/DeleteCommunityChannelMessageBody';
import CommunityChannelMessageDeleter from '@app/contexts/communities/application/delete-channel-message/CommunityChannelMessageDeleter';
import { CommunityChannelMessageDeleteMessage } from '@app/contexts/communities/application/delete-channel-message/messages/CommunityChannelMessageDeleteMessage';
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

import { DeletedCommunityChannelMessageViewModel } from '../view-model/DeletedCommunityChannelMessageViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class DeleteCommunityChannelMessageRoute extends CommunityRouteSupport {
  private readonly deleter = this.get<CommunityChannelMessageDeleter>(
    CommunityChannelMessageDeleter,
  );

  @Delete('/:communityId/channels/:channelId/messages/:messageId')
  public async deleteMessage(
    @Param('communityId') communityId: string,
    @Param('channelId') channelId: string,
    @Param('messageId') messageId: string,
    @Body() body: DeleteCommunityChannelMessageBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const deletion = await this.deleter.delete(
      new CommunityChannelMessageDeleteMessage({
        actorIdentityId: actorIdentityId.valueOf(),
        channelId,
        communityId,
        createdAt: body.createdAt,
        messageId: body.id,
        signature: body.signature,
        targetMessageId: messageId,
      }),
    );

    return response.status(HttpRouteStatusEnum.OK).send(
      new DeletedCommunityChannelMessageViewModel({
        channelId,
        communityId,
        deletedByIdentityId: actorIdentityId.valueOf(),
        id: deletion.getId().valueOf(),
        targetMessageId: messageId,
        type: 'deleted',
      }).toResource(),
    );
  }
}
