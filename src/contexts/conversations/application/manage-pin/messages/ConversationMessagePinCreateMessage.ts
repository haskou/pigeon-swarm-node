import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

import { ConversationId } from '../../../domain/value-objects/ConversationId';
import { MessageId } from '../../../domain/value-objects/MessageId';

export class ConversationMessagePinCreateMessage {
  public readonly conversationId: ConversationId;
  public readonly createdAt: Timestamp;
  public readonly identityId: IdentityId;
  public readonly messageId: MessageId;
  public readonly proof: PublicMutationProof;

  constructor(
    identityId: string,
    conversationId: string,
    messageId: string,
    createdAt: number,
    proof: unknown,
  ) {
    this.identityId = new IdentityId(identityId);
    this.conversationId = new ConversationId(conversationId);
    this.messageId = new MessageId(messageId);
    this.createdAt = new Timestamp(createdAt);
    this.proof = PublicMutationProof.fromPrimitives(proof);
  }
}
