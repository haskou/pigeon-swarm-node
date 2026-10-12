import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { assert } from '@haskou/value-objects';

import { ConversationParticipantNotFoundError } from '../../domain/errors/ConversationParticipantNotFoundError';
import ConversationRepository from '../../domain/repositories/ConversationRepository';
import { ConversationId } from '../../domain/value-objects/ConversationId';

export default class ConversationFrontierFinder {
  constructor(private readonly repository: ConversationRepository) {}

  /** The parents a client signs its next operation on; only members may read them. */
  public async find(
    conversationId: ConversationId,
    requesterIdentityId: IdentityId,
  ): Promise<string[]> {
    const conversation =
      await this.repository.requireMetadataById(conversationId);

    assert(
      conversation.hasParticipant(requesterIdentityId),
      new ConversationParticipantNotFoundError(),
    );

    return this.repository.findFrontier(conversationId);
  }
}
