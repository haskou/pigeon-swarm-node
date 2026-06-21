import { PostCommunityChannelMessageBody } from '@app/apps/apis/communities-api/bodies/PostCommunityChannelMessageBody';
import CommunityChannelMessageSender from '@app/contexts/communities/application/send-channel-message/CommunityChannelMessageSender';
import { CommunityChannelMessageSendMessage } from '@app/contexts/communities/application/send-channel-message/messages/CommunityChannelMessageSendMessage';
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

import { CommunityChannelMessageViewModel } from '../view-model/CommunityChannelMessageViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class PostCommunityChannelMessageRoute extends CommunityRouteSupport {
  private readonly sender = this.get<CommunityChannelMessageSender>(
    CommunityChannelMessageSender,
  );

  @Post('/:communityId/channels/:channelId/messages')
  public async sendMessage(
    @Param('communityId') communityId: string,
    @Param('channelId') channelId: string,
    @Body() body: PostCommunityChannelMessageBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const authorIdentityId = await this.authenticate(request);
    const message = await this.sender.send(
      new CommunityChannelMessageSendMessage({
        attachmentExternalIdentifiers: body.attachmentExternalIdentifiers,
        authorIdentityId: authorIdentityId.valueOf(),
        channelId,
        communityId,
        createdAt: body.createdAt,
        encryptedPayload: body.encryptedPayload,
        mentions: body.mentions,
        messageId: body.id,
        plaintextPayload: body.plaintextPayload,
        replyToMessageId: body.replyToMessageId,
        signature: body.signature,
      }),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new CommunityChannelMessageViewModel(message).toResource());
  }
}
