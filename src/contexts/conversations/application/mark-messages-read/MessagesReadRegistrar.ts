import ConversationRepository from '../../domain/repositories/ConversationRepository';
import { MessagesReadMarkMessage } from './messages/MessagesReadMarkMessage';

export default class MessagesReadRegistrar {
  constructor(private readonly repository: ConversationRepository) {}

  public async register(message: MessagesReadMarkMessage): Promise<boolean> {
    // A marker behind the stored one is refused, see markReadUntil.
    return this.repository.markReadUntil(
      message.conversationId,
      message.readerIdentityId,
      message.messageId,
    );
  }
}
