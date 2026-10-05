import { Message } from '@app/contexts/conversations/domain/entities/messages/Message';
import { MessageDeleted } from '@app/contexts/conversations/domain/entities/messages/MessageDeleted';
import { MessageEdited } from '@app/contexts/conversations/domain/entities/messages/MessageEdited';
import { MessagePoll } from '@app/contexts/conversations/domain/entities/messages/MessagePoll';
import { MessageSent } from '@app/contexts/conversations/domain/entities/messages/MessageSent';
import { MessageType } from '@app/contexts/conversations/domain/value-objects/MessageType';

import { OrbitDBConversationMessageDocument } from '../documents/OrbitDBConversationMessageDocument';

export default class OrbitDBConversationMessageMapper {
  private requireString(value: string | undefined, field: string): string {
    if (value === undefined) {
      throw new Error(
        `Invalid conversation message document: missing ${field}`,
      );
    }

    return value;
  }

  public toDocument(message: Message): OrbitDBConversationMessageDocument {
    return Object.fromEntries(
      Object.entries({
        ...message.toPrimitives(),
        scopeType: 'conversation',
      }).filter(([, value]) => value !== undefined),
    ) as OrbitDBConversationMessageDocument;
  }

  public toDomain(document: OrbitDBConversationMessageDocument): Message {
    const type = new MessageType(document.type);

    if (type.isEqual(MessageType.SENT)) {
      return MessageSent.fromPrimitives({
        ...document,
        encryptedPayload: this.requireString(
          document.encryptedPayload,
          'encryptedPayload',
        ),
      });
    }

    if (type.isEqual(MessageType.EDITED)) {
      return MessageEdited.fromPrimitives({
        ...document,
        encryptedPayload: this.requireString(
          document.encryptedPayload,
          'encryptedPayload',
        ),
        targetMessageId: this.requireString(
          document.targetMessageId,
          'targetMessageId',
        ),
      });
    }

    if (type.isEqual(MessageType.POLL)) {
      return MessagePoll.fromPrimitives({
        ...document,
        pollId: this.requireString(document.pollId, 'pollId'),
      });
    }

    return MessageDeleted.fromPrimitives({
      ...document,
      targetMessageId: this.requireString(
        document.targetMessageId,
        'targetMessageId',
      ),
    });
  }
}
