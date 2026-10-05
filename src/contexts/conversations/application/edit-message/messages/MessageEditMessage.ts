import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

import { ConversationId } from '../../../domain/value-objects/ConversationId';
import { EncryptedMessagePayload } from '../../../domain/value-objects/EncryptedMessagePayload';
import { MessageId } from '../../../domain/value-objects/MessageId';

export class MessageEditMessage {
  public readonly authorIdentityId: IdentityId;
  public readonly conversationId: ConversationId;
  public readonly createdAt: Timestamp;
  public readonly encryptedPayload: EncryptedMessagePayload;
  public readonly id: MessageId;
  public readonly previousMessageIds: MessageId[];
  public readonly proof: PublicMutationProof;
  public readonly targetMessageId: MessageId;

  constructor(
    conversationId: string,
    targetMessageId: string,
    authorIdentityId: string,
    payload: {
      createdAt: number;
      encryptedPayload: string;
      id: string;
      previousMessageIds?: string[];
      mutation: unknown;
    },
  ) {
    this.authorIdentityId = new IdentityId(authorIdentityId);
    this.conversationId = new ConversationId(conversationId);
    this.createdAt = new Timestamp(payload.createdAt);
    this.encryptedPayload = new EncryptedMessagePayload(
      payload.encryptedPayload,
    );
    this.id = new MessageId(payload.id);
    this.previousMessageIds = (
      payload.previousMessageIds ?? [targetMessageId]
    ).map((messageId) => new MessageId(messageId));
    this.proof = PublicMutationProof.fromPrimitives(payload.mutation);
    this.targetMessageId = new MessageId(targetMessageId);
  }
}
