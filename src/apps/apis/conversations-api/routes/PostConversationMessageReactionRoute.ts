import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import MessageReactionAdder from '@app/contexts/conversations/application/add-reaction/MessageReactionAdder';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import {
  Body,
  JsonController,
  Param,
  Post,
  Req,
  Res,
} from 'routing-controllers';

import { ConversationMessageReactionBody } from '../bodies/ConversationMessageReactionBody';
import { ConversationMessageReactionRequest } from '../requests/ConversationMessageReactionRequest';
import { MessageReactionViewModel } from '../view-model/MessageReactionViewModel';

@JsonController('/conversations')
export class PostConversationMessageReactionRoute extends Route {
  private readonly adder: MessageReactionAdder =
    this.get<MessageReactionAdder>(MessageReactionAdder);

  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  @Post('/:conversationId/messages/:messageId/reactions')
  public async addReaction(
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
    @Body() body: ConversationMessageReactionBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const authorIdentityId =
      await this.signedRequestAuthenticator.authenticate(request);
    const reaction = await this.adder.add(
      new ConversationMessageReactionRequest(
        conversationId,
        messageId,
        body,
        authorIdentityId,
      ).getAddMessage(),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new MessageReactionViewModel(reaction).toResource());
  }
}
