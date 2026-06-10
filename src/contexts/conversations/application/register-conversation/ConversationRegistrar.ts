import { Conversation } from '../../domain/Conversation';
import ConversationRepository from '../../domain/repositories/ConversationRepository';
import { RegisterConversationMessage } from './messages/RegisterConversationMessage';

export default class ConversationRegistrar {
  constructor(private readonly repository: ConversationRepository) {}

  public async register(message: RegisterConversationMessage): Promise<void> {
    const existing = await this.repository.findMetadataById(
      message.conversationId,
    );

    if (existing) {
      return;
    }

    await this.repository.save(
      Conversation.fromPrimitives(message.toConversationPrimitives()),
    );
  }
}
