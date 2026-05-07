import { PrimitiveOf } from '@haskou/value-objects';

import { Message } from './Message';
import { MessageDeleted } from './MessageDeleted';
import { MessageEdited } from './MessageEdited';
import { MessageSent } from './MessageSent';
import { MessageEventType } from './value-objects/MessageEventType';

export class MessageFactory {
  private static isEdited(primitives: PrimitiveOf<Message>): boolean {
    return new MessageEventType(primitives.type).isEqual(
      MessageEventType.EDITED,
    );
  }

  private static isSent(primitives: PrimitiveOf<Message>): boolean {
    return new MessageEventType(primitives.type).isEqual(MessageEventType.SENT);
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
