import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import MessageDeleter from '@app/contexts/conversations/application/delete-message/MessageDeleter';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Request, Response } from 'express';
import {
  Body,
  Delete,
  JsonController,
  Param,
  Req,
  Res,
} from 'routing-controllers';

import { DeleteConversationMessageBody } from '../bodies/DeleteConversationMessageBody';
import { DeleteConversationMessageRequest } from '../requests/DeleteConversationMessageRequest';
import { MessageViewModel } from '../view-model/MessageViewModel';

@JsonController('/conversations')
export class DeleteConversationMessageRoute extends Route {
  private readonly deleter: MessageDeleter =
    this.get<MessageDeleter>(MessageDeleter);

  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  @Delete('/:conversationId/messages/:messageId')
  public async deleteMessage(
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
    @Body() body: DeleteConversationMessageBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const authorIdentityId =
      await this.signedRequestAuthenticator.authenticate(request);
    const message = await this.deleter.delete(
      new DeleteConversationMessageRequest(
        conversationId,
        messageId,
        body,
        authorIdentityId,
      ).getMessage(),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new MessageViewModel(message).toResource());
  }
}
