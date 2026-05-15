import { ConversationRepository } from '../../domain/repositories/ConversationRepository';
import { MessagesReadMarkMessage } from './messages/MessagesReadMarkMessage';

export default class MessagesReadRegistrar {
  constructor(private readonly repository: ConversationRepository) {}

  public async register(message: MessagesReadMarkMessage): Promise<void> {
    await this.repository.markReadUntil(
      message.conversationId,
      message.readerIdentityId,
      message.messageId,
    );
  }
}
