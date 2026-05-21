import { SignedHttpRequestAuthenticator } from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import MessageEditor from '@app/contexts/conversations/application/edit-message/MessageEditor';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Request, Response } from 'express';
import {
  Body,
  JsonController,
  Param,
  Put,
  Req,
  Res,
} from 'routing-controllers';

import { PutConversationMessageBody } from '../bodies/PutConversationMessageBody';
import { PutConversationMessageRequest } from '../requests/PutConversationMessageRequest';
import { MessageViewModel } from '../view-model/MessageViewModel';

@JsonController('/conversations')
export class PutConversationMessageRoute extends Route {
  private readonly editor: MessageEditor =
    this.get<MessageEditor>(MessageEditor);

  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  private getMessageId(request: Request): string {
    const messageId =
      request.params.messageId ||
      request.originalUrl.split('/messages/')[1]?.split('?')[0] ||
      request.params[0];

    return decodeURIComponent(
      Array.isArray(messageId) ? messageId[0] : messageId,
    );
  }

  @Put('/:conversationId/messages/:messageId((?!read-until$)[^/]+)')
  public async editMessage(
    @Param('conversationId') conversationId: string,
    @Body() body: PutConversationMessageBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const authorIdentityId =
      await this.signedRequestAuthenticator.authenticate(request);
    const messageId = this.getMessageId(request);
    const message = await this.editor.edit(
      new PutConversationMessageRequest(
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
