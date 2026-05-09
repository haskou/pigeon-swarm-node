import { Conversation } from '../../domain/Conversation';
import { OneToOneConversation } from '../../domain/OneToOneConversation';
import { ConversationRepository } from '../../domain/repositories/ConversationRepository';
import { CreateOneToOneConversationMessage } from './messages/CreateOneToOneConversationMessage';

export default class CreateOneToOneConversation {
  constructor(private readonly repository: ConversationRepository) {}

  public async create(
    message: CreateOneToOneConversationMessage,
  ): Promise<Conversation> {
    const existing = await this.repository.findOneToOne(
      message.firstParticipantIdentityId,
      message.secondParticipantIdentityId,
    );

    if (existing) {
      return existing;
    }

    const conversation = OneToOneConversation.create(
      message.firstParticipantIdentityId,
      message.secondParticipantIdentityId,
    );

    await this.repository.save(conversation);

    return conversation;
  }
}
