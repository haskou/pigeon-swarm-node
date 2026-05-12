import { SignedHttpRequestAuthenticator } from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import LatestMessagesFinder from '@app/contexts/conversations/application/find-latest-messages/LatestMessagesFinder';
import { MessageTargetNotFoundError } from '@app/contexts/conversations/domain/errors/MessageTargetNotFoundError';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Request, Response } from 'express';
import {
  Get,
  JsonController,
  Param,
  QueryParam,
  Req,
  Res,
} from 'routing-controllers';

import { GetConversationMessageRequest } from '../requests/GetConversationMessageRequest';
import { GetConversationMessagesAroundRequest } from '../requests/GetConversationMessagesAroundRequest';
import { GetConversationMessagesRequest } from '../requests/GetConversationMessagesRequest';
import { MessagesAroundViewModel } from '../view-model/MessagesAroundViewModel';
import { MessagesViewModel } from '../view-model/MessagesViewModel';
import { MessageViewModel } from '../view-model/MessageViewModel';

@JsonController('/conversations')
export class GetConversationMessagesRoute extends Route {
  private readonly finder: LatestMessagesFinder =
    this.get<LatestMessagesFinder>(LatestMessagesFinder);

  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  @Get('/:conversationId/messages')
  public async getMessages(
    @Param('conversationId') conversationId: string,
    @QueryParam('limit') limit: string | undefined,
    @QueryParam('beforeMessageId') beforeMessageId: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const requesterIdentityId =
      await this.signedRequestAuthenticator.authenticate(request);
    const messages = await this.finder.find(
      new GetConversationMessagesRequest(
        conversationId,
        requesterIdentityId,
        limit,
        beforeMessageId,
      ).getMessage(),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new MessagesViewModel(conversationId, messages).toResource());
  }

  @Get('/:conversationId/messages/:messageId')
  public async getMessage(
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const requesterIdentityId =
      await this.signedRequestAuthenticator.authenticate(request);
    const message = await this.finder.findById(
      new GetConversationMessageRequest(
        conversationId,
        messageId,
        requesterIdentityId,
      ).getMessage(),
    );

    if (!message) {
      throw new MessageTargetNotFoundError();
    }

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new MessageViewModel(message).toResource());
  }

  @Get('/:conversationId/messages/:messageId/around')
  public async getMessagesAround(
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
    @QueryParam('before') before: string | undefined,
    @QueryParam('after') after: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const requesterIdentityId =
      await this.signedRequestAuthenticator.authenticate(request);
    const messages = await this.finder.findAround(
      new GetConversationMessagesAroundRequest(
        conversationId,
        messageId,
        requesterIdentityId,
        before,
        after,
      ).getMessage(),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new MessagesAroundViewModel(messages).toResource());
  }
}
