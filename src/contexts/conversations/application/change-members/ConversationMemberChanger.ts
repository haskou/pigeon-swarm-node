import { assert } from '@haskou/value-objects';

import { Conversation } from '../../domain/Conversation';
import { ConversationNotFoundError } from '../../domain/errors/ConversationNotFoundError';
import { ConversationStateFold } from '../../domain/operations/ConversationStateFold';
import ConversationRepository from '../../domain/repositories/ConversationRepository';
import { ConversationMemberChangeMessage } from './messages/ConversationMemberChangeMessage';

export default class ConversationMemberChanger {
  constructor(private readonly repository: ConversationRepository) {}

  /**
   * Builds the operation the client signed, checks the folded roster of its
   * causal past lets the author perform it, and stores it. The signature is
   * verified by every other node against the same rules, so nothing signed
   * here grants authority the roster does not.
   */
  public async change(
    message: ConversationMemberChangeMessage,
  ): Promise<Conversation> {
    const conversation = await this.repository.findMetadataById(
      message.conversationId,
    );

    assert(conversation, new ConversationNotFoundError(message.conversationId));

    const operation = message.operation.build({
      action: message.action,
      args: message.targetIdentityId
        ? { identityId: message.targetIdentityId.valueOf() }
        : {},
      author: message.actorIdentityId,
      conversationId: message.conversationId,
      networkId: conversation.getNetworkId(),
    });

    ConversationStateFold.rosterAfter(
      await this.repository.findOperations(message.conversationId),
      operation,
    );
    await this.repository.saveOperation(operation, message.operation.proof);

    const changed = await this.repository.findById(message.conversationId);

    assert(changed, new ConversationNotFoundError(message.conversationId));

    return changed;
  }
}
