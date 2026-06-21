import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import LatestMessagesFinder from '@app/contexts/conversations/application/find-latest-messages/LatestMessagesFinder';
import { ThreadMessagesFindMessage } from '@app/contexts/conversations/application/find-latest-messages/messages/ThreadMessagesFindMessage';
import { MessageTargetNotFoundError } from '@app/contexts/conversations/domain/errors/MessageTargetNotFoundError';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
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
import { ConversationCallEventViewModel } from '../view-model/ConversationCallEventViewModel';
import { MessagesAroundViewModel } from '../view-model/MessagesAroundViewModel';
import { MessagesViewModel } from '../view-model/MessagesViewModel';
import { MessageViewModel } from '../view-model/MessageViewModel';

@JsonController('/conversations')
export class GetConversationMessagesRoute extends Route {
  private static readonly DEFAULT_LIMIT = 50;
  private static readonly MAX_LIMIT = 100;

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
    const timeline = await this.finder.findTimeline(
      new GetConversationMessagesRequest(
        conversationId,
        requesterIdentityId,
        limit,
        beforeMessageId,
      ).getMessage(),
    );
    const callEvents = timeline
      .getCalls()
      .flatMap((call) => ConversationCallEventViewModel.fromCall(call));

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(
        new MessagesViewModel(
          conversationId,
          timeline.getMessages(),
          callEvents,
          timeline.getPolls(),
          timeline.getLimit(),
          timeline.getReactions(),
        ).toResource(),
      );
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
    const reactions = await this.finder.findReactionsFor(
      new GetConversationMessageRequest(
        conversationId,
        messageId,
        requesterIdentityId,
      ).getMessage().conversationId,
      [message],
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new MessageViewModel(message, reactions).toResource());
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
    const reactions = await this.finder.findReactionsFor(
      new GetConversationMessagesAroundRequest(
        conversationId,
        messageId,
        requesterIdentityId,
        before,
        after,
      ).getMessage().conversationId,
      messages.getMessages(),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new MessagesAroundViewModel(messages, reactions).toResource());
  }

  @Get('/:conversationId/messages/:messageId/thread')
  public async getThreadMessages(
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
    @QueryParam('limit') limit: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const requesterIdentityId =
      await this.signedRequestAuthenticator.authenticate(request);
    const safeLimit = Math.min(
      Math.max(Number(limit) || GetConversationMessagesRoute.DEFAULT_LIMIT, 1),
      GetConversationMessagesRoute.MAX_LIMIT,
    );
    const messages = await this.finder.findThread(
      new ThreadMessagesFindMessage(
        conversationId,
        messageId,
        requesterIdentityId.valueOf(),
        safeLimit,
      ),
    );
    const reactions = await this.finder.findReactionsFor(
      new ConversationId(conversationId),
      messages,
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(
        new MessagesViewModel(
          conversationId,
          messages,
          [],
          [],
          safeLimit,
          reactions,
        ).toResource(),
      );
  }
}
