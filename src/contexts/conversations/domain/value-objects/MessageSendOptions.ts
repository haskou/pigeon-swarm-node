import { Timestamp } from '@haskou/value-objects';

import { MessageId } from './MessageId';

export class MessageSendOptions {
  public static empty(): MessageSendOptions {
    return new MessageSendOptions();
  }

  constructor(
    private readonly createdAt?: Timestamp,
    private readonly id?: MessageId,
    private readonly previousMessageIds: MessageId[] = [],
    private readonly replyToMessageId?: MessageId,
  ) {}

  public getCreatedAt(): Timestamp {
    return this.createdAt ?? Timestamp.now();
  }

  public getId(): MessageId {
    return this.id ?? MessageId.generate();
  }

  public getPreviousMessageIds(): MessageId[] {
    return [...this.previousMessageIds];
  }

  public getReplyToMessageId(): MessageId | undefined {
    return this.replyToMessageId;
  }
}
