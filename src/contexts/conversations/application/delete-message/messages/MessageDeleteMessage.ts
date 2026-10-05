import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

import { ConversationId } from '../../../domain/value-objects/ConversationId';
import { MessageId } from '../../../domain/value-objects/MessageId';

export class MessageDeleteMessage {
  public readonly authorIdentityId: IdentityId;
  public readonly conversationId: ConversationId;
  public readonly createdAt: Timestamp;
  public readonly id: MessageId;
  public readonly proof: PublicMutationProof;
  public readonly targetMessageId: MessageId;

  constructor(
    conversationId: string,
    targetMessageId: string,
    authorIdentityId: string,
    payload: {
      createdAt: number;
      id: string;
      mutation: unknown;
    },
  ) {
    this.authorIdentityId = new IdentityId(authorIdentityId);
    this.conversationId = new ConversationId(conversationId);
    this.createdAt = new Timestamp(payload.createdAt);
    this.id = new MessageId(payload.id);
    this.proof = PublicMutationProof.fromPrimitives(payload.mutation);
    this.targetMessageId = new MessageId(targetMessageId);
  }
}
