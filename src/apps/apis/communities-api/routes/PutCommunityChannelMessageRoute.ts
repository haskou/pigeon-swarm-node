import { PutCommunityChannelMessageBody } from '@app/apps/apis/communities-api/bodies/PutCommunityChannelMessageBody';
import CommunityChannelMessageEditor from '@app/contexts/communities/application/edit-channel-message/CommunityChannelMessageEditor';
import { CommunityChannelMessageEditMessage } from '@app/contexts/communities/application/edit-channel-message/messages/CommunityChannelMessageEditMessage';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import {
  Body,
  JsonController,
  Param,
  Put,
  Req,
  Res,
} from 'routing-controllers';

import { CommunityChannelMessageViewModel } from '../view-model/CommunityChannelMessageViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class PutCommunityChannelMessageRoute extends CommunityRouteSupport {
  private readonly editor = this.get<CommunityChannelMessageEditor>(
    CommunityChannelMessageEditor,
  );

  @Put('/:communityId/channels/:channelId/messages/:messageId')
  public async editMessage(
    @Param('communityId') communityId: string,
    @Param('channelId') channelId: string,
    @Param('messageId') messageId: string,
    @Body() body: PutCommunityChannelMessageBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const authorIdentityId = await this.authenticate(request);
    const message = await this.editor.edit(
      new CommunityChannelMessageEditMessage({
        actorIdentityId: authorIdentityId.valueOf(),
        attachmentExternalIdentifiers: body.attachmentExternalIdentifiers ?? [],
        channelId,
        communityId,
        createdAt: body.createdAt,
        encryptedPayload: body.encryptedPayload,
        mentions: body.mentions,
        messageId,
        plaintextPayload: body.plaintextPayload,
        signature: body.signature,
      }),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new CommunityChannelMessageViewModel(message).toResource());
  }
}
