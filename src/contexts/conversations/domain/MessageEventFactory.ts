import { MessageDeleted } from './MessageDeleted';
import { MessageEdited } from './MessageEdited';
import { MessageEvent, MessageEventPrimitives } from './MessageEvent';
import { MessageSent } from './MessageSent';
import { MessageEventType } from './value-objects/MessageEventType';

export class MessageEventFactory {
  private static isEdited(primitives: MessageEventPrimitives): boolean {
    return new MessageEventType(primitives.type).isEqual(
      MessageEventType.EDITED,
    );
  }

  private static isSent(primitives: MessageEventPrimitives): boolean {
    return new MessageEventType(primitives.type).isEqual(MessageEventType.SENT);
  }

  public static fromPrimitives(
    primitives: MessageEventPrimitives,
  ): MessageEvent {
    if (MessageEventFactory.isSent(primitives)) {
      return MessageSent.fromPrimitives(primitives);
    }

    if (MessageEventFactory.isEdited(primitives)) {
      return MessageEdited.fromPrimitives(primitives);
    }

    return MessageDeleted.fromPrimitives(primitives);
  }
}
