import { Conversation } from '@app/contexts/conversations/domain/Conversation';
import { Message } from '@app/contexts/conversations/domain/Message';
import { MessageFactory } from '@app/contexts/conversations/domain/MessageFactory';
import { MessageType } from '@app/contexts/conversations/domain/value-objects/MessageType';
import { PrimitiveOf, Timestamp } from '@haskou/value-objects';

import { OrbitDBConversationMessageDocument } from '../documents/OrbitDBConversationMessageDocument';

export default class OrbitDBConversationMessageMapper {
  public toDocument(
    conversation: Conversation,
    message: Message,
    receivedAt: Timestamp = Timestamp.now(),
  ): OrbitDBConversationMessageDocument {
    const conversationPrimitives = conversation.toPrimitives();
    const messagePrimitives = message.toPrimitives();
    const recipientIds = conversationPrimitives.participantIds.filter(
      (participantId) => participantId !== messagePrimitives.authorId,
    );

    return {
      ...messagePrimitives,
      messageId: messagePrimitives.id,
      networkId: conversationPrimitives.networkId,
      receivedAt: receivedAt.valueOf(),
      recipientIds,
      scopeType: 'conversation',
      valid: true,
    };
  }

  public tombstone(
    conversationId: string,
    messageId: string,
    receivedAt: Timestamp = Timestamp.now(),
  ): Partial<OrbitDBConversationMessageDocument> & {
    id: string;
    scopeType: 'conversation';
    valid: false;
  } {
    return {
      conversationId,
      createdAt: receivedAt.valueOf(),
      id: messageId,
      messageId,
      previousMessageIds: [],
      receivedAt: receivedAt.valueOf(),
      scopeType: 'conversation',
      type: MessageType.DELETED.valueOf(),
      valid: false,
    };
  }

  public toDomain(document: OrbitDBConversationMessageDocument): Message {
    return MessageFactory.fromPrimitives(document as PrimitiveOf<Message>);
  }
}
