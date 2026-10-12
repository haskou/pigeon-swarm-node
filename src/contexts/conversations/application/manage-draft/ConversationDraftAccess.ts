import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { ConversationParticipantNotFoundError } from '../../domain/errors/ConversationParticipantNotFoundError';
import ConversationRepository from '../../domain/repositories/ConversationRepository';
import { ConversationId } from '../../domain/value-objects/ConversationId';

export default class ConversationDraftAccess {
  constructor(
    private readonly conversationRepository: ConversationRepository,
  ) {}

  public async assertCanRead(
    conversationId: ConversationId,
    identityId: IdentityId,
  ): Promise<void> {
    const conversation =
      await this.conversationRepository.requireMetadataById(conversationId);

    if (!conversation.hasParticipant(identityId)) {
      throw new ConversationParticipantNotFoundError();
    }
  }
}
