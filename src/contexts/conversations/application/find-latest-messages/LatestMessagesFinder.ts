import CallRepository from '@app/contexts/calls/domain/repositories/CallRepository';
import { ConversationMessagesAround } from '@app/contexts/conversations/domain/ConversationMessagesAround';
import { Message } from '@app/contexts/conversations/domain/entities/messages/Message';
import { MessageReaction } from '@app/contexts/conversations/domain/entities/messages/MessageReaction';
import { ConversationNotFoundError } from '@app/contexts/conversations/domain/errors/ConversationNotFoundError';
import { ConversationParticipantNotFoundError } from '@app/contexts/conversations/domain/errors/ConversationParticipantNotFoundError';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import MessageReactionRepository from '@app/contexts/conversations/domain/repositories/MessageReactionRepository';
import PollRepository from '@app/contexts/polls/domain/repositories/PollRepository';

import { ConversationMessagesTimeline } from './ConversationMessagesTimeline';
import { LatestMessagesFindMessage } from './messages/LatestMessagesFindMessage';
import { MessageFindMessage } from './messages/MessageFindMessage';
import { MessagesAroundFindMessage } from './messages/MessagesAroundFindMessage';
import { ThreadMessagesFindMessage } from './messages/ThreadMessagesFindMessage';

export default class LatestMessagesFinder {
  constructor(
    private readonly callRepository: CallRepository,
    private readonly conversationRepository: ConversationRepository,
    private readonly pollRepository: PollRepository,
    private readonly reactionRepository: MessageReactionRepository,
  ) {}

  private async ensureRequesterCanReadConversation(
    message: LatestMessagesFindMessage | MessageFindMessage,
  ): Promise<void> {
    const conversation = await this.conversationRepository.findMetadataById(
      message.conversationId,
    );

    if (!conversation) {
      throw new ConversationNotFoundError(message.conversationId);
    }

    if (!conversation.hasParticipant(message.requesterIdentityId)) {
      throw new ConversationParticipantNotFoundError();
    }
  }

  public async find(message: LatestMessagesFindMessage): Promise<Message[]> {
    await this.ensureRequesterCanReadConversation(message);

    return this.conversationRepository.findLatestMessages(
      message.conversationId,
      message.limit,
      message.beforeMessageId,
    );
  }

  public async findTimeline(
    message: LatestMessagesFindMessage,
  ): Promise<ConversationMessagesTimeline> {
    const messages = await this.find(message);
    const calls = await this.callRepository.findByConversationId(
      message.conversationId,
    );
    const polls =
      message.beforeMessageId && messages.length === 0
        ? []
        : await this.pollRepository.findByGroupConversation(
            message.conversationId,
            message.limit,
            message.beforeMessageId
              ? messages.at(-1)?.toPrimitives().createdAt
              : undefined,
          );
    const reactions = await this.findReactionsFor(
      message.conversationId,
      messages,
    );

    return new ConversationMessagesTimeline(
      messages,
      message.beforeMessageId && messages.length === 0 ? [] : calls,
      polls,
      reactions,
      message.limit,
    );
  }

  public async findReactionsFor(
    conversationId: LatestMessagesFindMessage['conversationId'],
    messages: Message[],
  ): Promise<MessageReaction[]> {
    return this.reactionRepository.findByMessageIds(
      conversationId,
      messages.map((message) => message.getId()),
    );
  }

  public async findAround(
    message: MessagesAroundFindMessage,
  ): Promise<ConversationMessagesAround> {
    await this.ensureRequesterCanReadConversation(message);

    return this.conversationRepository.findMessagesAround(
      message.conversationId,
      message.messageId,
      message.before,
      message.after,
    );
  }

  public async findById(
    message: MessageFindMessage,
  ): Promise<Message | undefined> {
    await this.ensureRequesterCanReadConversation(message);

    return this.conversationRepository.findMessageById(
      message.conversationId,
      message.messageId,
    );
  }

  public async findThread(
    message: ThreadMessagesFindMessage,
  ): Promise<Message[]> {
    await this.ensureRequesterCanReadConversation(message);

    return this.conversationRepository.findThreadMessages(
      message.conversationId,
      message.messageId,
      message.limit,
    );
  }
}
