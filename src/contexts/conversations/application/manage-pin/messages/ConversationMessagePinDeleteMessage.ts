import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { ConversationId } from '../../../domain/value-objects/ConversationId';
import { MessageId } from '../../../domain/value-objects/MessageId';

export class ConversationMessagePinDeleteMessage {
  public readonly conversationId: ConversationId;
  public readonly identityId: IdentityId;
  public readonly messageId: MessageId;
  public readonly proof: PublicMutationProof;

  constructor(
    identityId: string,
    conversationId: string,
    messageId: string,
    proof: unknown,
  ) {
    this.identityId = new IdentityId(identityId);
    this.conversationId = new ConversationId(conversationId);
    this.messageId = new MessageId(messageId);
    this.proof = PublicMutationProof.fromPrimitives(proof);
  }
}
