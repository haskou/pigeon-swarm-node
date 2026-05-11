import { Message } from '@app/contexts/conversations/domain/Message';

import { MessageResource } from '../resources/MessageResource';

type MessageResourcePrimitives = ReturnType<Message['toPrimitives']> & {
  encryptedPayload?: string;
};

export class MessageViewModel {
  constructor(private readonly message: Message) {}

  public toResource(): MessageResource {
    const primitives = this.message.toPrimitives() as MessageResourcePrimitives;

    return {
      attachmentExternalIdentifiers: primitives.attachmentExternalIdentifiers,
      authorIdentityId: primitives.authorId,
      conversationId: primitives.conversationId,
      createdAt: primitives.createdAt,
      encryptedPayload: primitives.encryptedPayload,
      id: primitives.id,
      previousMessageIds: primitives.previousMessageIds,
      replyToMessageId: primitives.replyToMessageId,
      targetMessageId: primitives.targetMessageId,
      type: primitives.type,
    };
  }
}
