import { Timestamp } from '@haskou/value-objects';

import { MessageId } from './MessageId';

export class MessagePollOptions {
  public static empty(): MessagePollOptions {
    return new MessagePollOptions();
  }

  constructor(
    private readonly createdAt?: Timestamp,
    private readonly id?: MessageId,
    private readonly previousMessageIds?: MessageId[],
  ) {}

  public getCreatedAt(): Timestamp {
    return this.createdAt ?? Timestamp.now();
  }

  public getId(pollMessageId: MessageId): MessageId {
    return this.id ?? pollMessageId;
  }

  public getPreviousMessageIds(fallback: MessageId[]): MessageId[] {
    return this.previousMessageIds ?? fallback;
  }
}
