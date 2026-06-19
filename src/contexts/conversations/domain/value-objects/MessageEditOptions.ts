import { Timestamp } from '@haskou/value-objects';

import { MessageId } from './MessageId';

export class MessageEditOptions {
  public static empty(): MessageEditOptions {
    return new MessageEditOptions();
  }

  constructor(
    private readonly createdAt?: Timestamp,
    private readonly id?: MessageId,
    private readonly previousMessageIds?: MessageId[],
  ) {}

  public getCreatedAt(): Timestamp {
    return this.createdAt ?? Timestamp.now();
  }

  public getId(): MessageId {
    return this.id ?? MessageId.generate();
  }

  public getPreviousMessageIds(targetMessageId: MessageId): MessageId[] {
    return this.previousMessageIds ?? [targetMessageId];
  }
}
