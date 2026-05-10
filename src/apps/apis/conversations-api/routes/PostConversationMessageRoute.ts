import { SignedHttpRequestAuthenticator } from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import MessageSender from '@app/contexts/conversations/application/send-message/MessageSender';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Request, Response } from 'express';
import {
  Body,
  JsonController,
  Param,
  Post,
  Req,
  Res,
} from 'routing-controllers';

import { PostConversationMessageBody } from '../bodies/PostConversationMessageBody';
import { PostConversationMessageRequest } from '../requests/PostConversationMessageRequest';
import { MessageViewModel } from '../view-model/MessageViewModel';

@JsonController('/conversations')
export class PostConversationMessageRoute extends Route {
  private readonly sender: MessageSender =
    this.get<MessageSender>(MessageSender);

  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  @Post('/:conversationId/messages')
  public async sendMessage(
    @Param('conversationId') conversationId: string,
    @Body() body: PostConversationMessageBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const authorIdentityId =
      await this.signedRequestAuthenticator.authenticate(request);
    const message = await this.sender.send(
      new PostConversationMessageRequest(
        conversationId,
        body,
        authorIdentityId,
      ).getMessage(),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new MessageViewModel(message).toResource());
  }
}
