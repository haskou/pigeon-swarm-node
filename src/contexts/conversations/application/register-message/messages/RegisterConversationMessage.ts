import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';

import { ConversationId } from '../../../domain/value-objects/ConversationId';
import { MessageId } from '../../../domain/value-objects/MessageId';

export class RegisterConversationMessage {
  public readonly conversationId: ConversationId;
  public readonly messageId: MessageId;
  public readonly proof?: PublicMutationProof;

  constructor(conversationId: string, messageId: string, proof?: unknown) {
    this.conversationId = new ConversationId(conversationId);
    this.messageId = new MessageId(messageId);
    this.proof =
      proof === undefined
        ? undefined
        : PublicMutationProof.fromPrimitives(proof);
  }
}
