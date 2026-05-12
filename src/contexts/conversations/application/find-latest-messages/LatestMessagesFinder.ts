import { ConversationNotFoundError } from '@app/contexts/conversations/domain/errors/ConversationNotFoundError';
import { ConversationParticipantNotFoundError } from '@app/contexts/conversations/domain/errors/ConversationParticipantNotFoundError';
import { Message } from '@app/contexts/conversations/domain/Message';
import {
  ConversationMessagesAround,
  ConversationRepository,
} from '@app/contexts/conversations/domain/repositories/ConversationRepository';

import { LatestMessagesFindMessage } from './messages/LatestMessagesFindMessage';
import { MessageFindMessage } from './messages/MessageFindMessage';
import { MessagesAroundFindMessage } from './messages/MessagesAroundFindMessage';

export default class LatestMessagesFinder {
  constructor(
    private readonly conversationRepository: ConversationRepository,
  ) {}

  private async ensureRequesterCanReadConversation(
    message: LatestMessagesFindMessage | MessageFindMessage,
  ): Promise<void> {
    const conversation = await this.conversationRepository.findById(
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
}
