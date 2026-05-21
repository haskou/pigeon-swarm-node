import { PollId } from '@app/contexts/polls/domain/value-objects/PollId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { PrimitiveOf, Signature, Timestamp } from '@haskou/value-objects';

import { Message, MessageType } from './Message';
import { MessageMetadata } from './MessageMetadata';
import { ConversationId } from './value-objects/ConversationId';
import { MessageId } from './value-objects/MessageId';

export type MessagePollCreateData = {
  authorId: IdentityId;
  conversationId: ConversationId;
  createdAt?: Timestamp;
  id?: MessageId;
  pollId: PollId;
  previousMessageIds?: MessageId[];
  signature: Signature;
};

export class MessagePoll extends Message {
  public static create(data: MessagePollCreateData): MessagePoll {
    return new MessagePoll(
      new MessageMetadata(
        data.id ?? new MessageId(data.pollId.valueOf()),
        data.conversationId,
        data.authorId,
        data.previousMessageIds ?? [],
        data.createdAt ?? Timestamp.now(),
        data.signature,
      ),
      data.pollId,
    );
  }

  public static fromPrimitives(
    primitives: PrimitiveOf<MessagePoll>,
  ): MessagePoll {
    return new MessagePoll(
      new MessageMetadata(
        new MessageId(primitives.id),
        new ConversationId(primitives.conversationId),
        new IdentityId(primitives.authorId),
        primitives.previousMessageIds.map(
          (messageId) => new MessageId(messageId),
        ),
        new Timestamp(primitives.createdAt),
        new Signature(primitives.signature),
      ),
      new PollId(primitives.pollId),
    );
  }

  constructor(
    metadata: MessageMetadata,
    private readonly pollId: PollId,
  ) {
    super(metadata);
  }

  public getType(): MessageType {
    return MessageType.POLL;
  }

  public toPrimitives() {
    return {
      ...super.toPrimitives(),
      pollId: this.pollId.valueOf(),
    };
  }
}
