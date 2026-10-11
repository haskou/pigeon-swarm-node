import ConversationRepository from '../../domain/repositories/ConversationRepository';
import { MessagesReadMarkMessage } from './messages/MessagesReadMarkMessage';

export default class MessagesReadRegistrar {
  constructor(private readonly repository: ConversationRepository) {}

  public async register(message: MessagesReadMarkMessage): Promise<void> {
    // A marker behind the stored one is dropped, see markReadUntil.
    await this.repository.markReadUntil(
      message.conversationId,
      message.readerIdentityId,
      message.messageId,
    );
  }
}
