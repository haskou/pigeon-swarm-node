import { PrimitiveOf } from '@haskou/value-objects';

import { MessageType } from '../../value-objects/MessageType';
import { Message } from './Message';
import { MessageDeleted } from './MessageDeleted';
import { MessageEdited } from './MessageEdited';
import { MessagePoll } from './MessagePoll';
import { MessageSent } from './MessageSent';

export class MessageFactory {
  private static isEdited(
    primitives: PrimitiveOf<Message>,
  ): primitives is PrimitiveOf<MessageEdited> {
    return (
      new MessageType(primitives.type).isEqual(MessageType.EDITED) &&
      'encryptedPayload' in primitives &&
      'targetMessageId' in primitives
    );
  }

  private static isSent(
    primitives: PrimitiveOf<Message>,
  ): primitives is PrimitiveOf<MessageSent> {
    return (
      new MessageType(primitives.type).isEqual(MessageType.SENT) &&
      'encryptedPayload' in primitives
    );
  }

  private static isPoll(
    primitives: PrimitiveOf<Message>,
  ): primitives is PrimitiveOf<MessagePoll> {
    return (
      new MessageType(primitives.type).isEqual(MessageType.POLL) &&
      'pollId' in primitives
    );
  }

  public static fromPrimitives(primitives: PrimitiveOf<Message>): Message {
    if (MessageFactory.isSent(primitives)) {
      return MessageSent.fromPrimitives(primitives);
    }

    if (MessageFactory.isEdited(primitives)) {
      return MessageEdited.fromPrimitives(primitives);
    }

    if (MessageFactory.isPoll(primitives)) {
      return MessagePoll.fromPrimitives(primitives);
    }

    return MessageDeleted.fromPrimitives(primitives);
  }
}
