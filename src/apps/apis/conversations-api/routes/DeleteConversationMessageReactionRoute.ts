import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import MessageReactionRemover from '@app/contexts/conversations/application/remove-reaction/MessageReactionRemover';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
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

import { ConversationMessageReactionBody } from '../bodies/ConversationMessageReactionBody';
import { ConversationMessageReactionRequest } from '../requests/ConversationMessageReactionRequest';
import { MessageReactionViewModel } from '../view-model/MessageReactionViewModel';

@JsonController('/conversations')
export class DeleteConversationMessageReactionRoute extends Route {
  private readonly remover: MessageReactionRemover =
    this.get<MessageReactionRemover>(MessageReactionRemover);

  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  @Delete('/:conversationId/messages/:messageId/reactions')
  public async removeReaction(
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
    @Body() body: ConversationMessageReactionBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const authorIdentityId =
      await this.signedRequestAuthenticator.authenticate(request);
    const reaction = await this.remover.remove(
      new ConversationMessageReactionRequest(
        conversationId,
        messageId,
        body,
        authorIdentityId,
      ).getRemoveMessage(),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new MessageReactionViewModel(reaction).toResource());
  }
}
