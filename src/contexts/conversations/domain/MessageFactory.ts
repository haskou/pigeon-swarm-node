import { PrimitiveOf } from '@haskou/value-objects';

import { Message } from './Message';
import { MessageDeleted } from './MessageDeleted';
import { MessageEdited } from './MessageEdited';
import { MessageSent } from './MessageSent';
import { MessageType } from './value-objects/MessageType';

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

  public static fromPrimitives(primitives: PrimitiveOf<Message>): Message {
    if (MessageFactory.isSent(primitives)) {
      return MessageSent.fromPrimitives(primitives);
    }

    if (MessageFactory.isEdited(primitives)) {
      return MessageEdited.fromPrimitives(primitives);
    }

    return MessageDeleted.fromPrimitives(primitives);
  }
}
