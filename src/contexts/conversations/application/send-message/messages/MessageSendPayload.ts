import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { Timestamp } from '@haskou/value-objects';

import { EncryptedMessagePayload } from '../../../domain/value-objects/EncryptedMessagePayload';
import { MessageId } from '../../../domain/value-objects/MessageId';
import { MessageSendOptions } from '../../../domain/value-objects/MessageSendOptions';

export class MessageSendPayload {
  private readonly createdAt: Timestamp;
  private readonly encryptedPayload: EncryptedMessagePayload;
  private readonly id: MessageId;
  private readonly previousMessageIds: MessageId[];
  private readonly proof: PublicMutationProof;
  private readonly replyToMessageId?: MessageId;

  constructor(
    id: string,
    encryptedPayload: string,
    mutation: unknown,
    createdAt: number,
    previousMessageIds: string[] = [],
    replyToMessageId?: string,
  ) {
    this.createdAt = new Timestamp(createdAt);
    this.encryptedPayload = new EncryptedMessagePayload(encryptedPayload);
    this.id = new MessageId(id);
    this.previousMessageIds = previousMessageIds.map(
      (messageId) => new MessageId(messageId),
    );
    this.replyToMessageId = replyToMessageId
      ? new MessageId(replyToMessageId)
      : undefined;
    this.proof = PublicMutationProof.fromPrimitives(mutation);
  }

  public getEncryptedPayload(): EncryptedMessagePayload {
    return this.encryptedPayload;
  }

  public getProof(): PublicMutationProof {
    return this.proof;
  }

  public getOptions(): MessageSendOptions {
    return new MessageSendOptions(
      this.createdAt,
      this.id,
      this.previousMessageIds,
      this.replyToMessageId,
    );
  }

  public getPreviousMessageIds(): MessageId[] {
    return [...this.previousMessageIds];
  }
}
