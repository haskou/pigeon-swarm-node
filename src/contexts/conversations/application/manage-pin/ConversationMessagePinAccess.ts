import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { Conversation } from '../../domain/Conversation';
import { ConversationNotFoundError } from '../../domain/errors/ConversationNotFoundError';
import { ConversationParticipantNotFoundError } from '../../domain/errors/ConversationParticipantNotFoundError';
import ConversationRepository from '../../domain/repositories/ConversationRepository';
import { ConversationId } from '../../domain/value-objects/ConversationId';

export default class ConversationMessagePinAccess {
  constructor(
    private readonly conversationRepository: ConversationRepository,
  ) {}

  public async findReadableConversation(
    conversationId: ConversationId,
    identityId: IdentityId,
  ): Promise<Conversation> {
    const conversation =
      await this.conversationRepository.findMetadataById(conversationId);

    if (!conversation) {
      throw new ConversationNotFoundError(conversationId);
    }

    if (!conversation.hasParticipant(identityId)) {
      throw new ConversationParticipantNotFoundError();
    }

    return conversation;
  }
}
