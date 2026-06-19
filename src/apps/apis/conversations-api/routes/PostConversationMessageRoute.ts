import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import MessageSender from '@app/contexts/conversations/application/send-message/MessageSender';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { MessageId } from '@app/contexts/conversations/domain/value-objects/MessageId';
import { MessagePollOptions } from '@app/contexts/conversations/domain/value-objects/MessagePollOptions';
import PollRepository from '@app/contexts/polls/domain/repositories/PollRepository';
import { PollId } from '@app/contexts/polls/domain/value-objects/PollId';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Signature } from '@haskou/value-objects';
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

  private readonly polls = this.get<PollRepository>(PollRepository);

  private conversationRepository(): ConversationRepository {
    return this.get<ConversationRepository>(ConversationRepository);
  }

  private async registerPreviousPollMessage(
    conversation: Awaited<ReturnType<ConversationRepository['findById']>>,
    conversationId: ConversationId,
    previousMessageId: string,
    request: Request,
  ): Promise<boolean> {
    if (!conversation) {
      return false;
    }
    const messageId = new MessageId(previousMessageId);

    if (conversation.findMessageById(messageId)) {
      return false;
    }
    const poll = await this.polls.findById(new PollId(previousMessageId));

    if (
      !poll ||
      !poll.getScope().getConversationId()?.isEqual(conversationId)
    ) {
      return false;
    }
    conversation.addPollMessage(
      poll.getCreatorIdentityId(),
      poll.getId(),
      new Signature(request.header('X-Signature') || ''),
      new MessagePollOptions(poll.getCreatedAt(), undefined, []),
    );

    return true;
  }

  private async registerPreviousPollMessages(
    conversationId: ConversationId,
    previousMessageIds: string[],
    request: Request,
  ): Promise<void> {
    if (previousMessageIds.length === 0) {
      return;
    }
    const conversation =
      await this.conversationRepository().findById(conversationId);

    let changed = false;

    for (const previousMessageId of previousMessageIds) {
      const registered = await this.registerPreviousPollMessage(
        conversation,
        conversationId,
        previousMessageId,
        request,
      );

      changed = registered || changed;
    }

    if (conversation && changed) {
      await this.conversationRepository().save(conversation);
    }
  }

  @Post('/:conversationId/messages')
  public async sendMessage(
    @Param('conversationId') conversationId: string,
    @Body() body: PostConversationMessageBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const authorIdentityId =
      await this.signedRequestAuthenticator.authenticate(request);
    await this.registerPreviousPollMessages(
      new ConversationId(conversationId),
      body.previousMessageIds ?? [],
      request,
    );
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
