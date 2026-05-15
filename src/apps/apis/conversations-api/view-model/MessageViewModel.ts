import { Message } from '@app/contexts/conversations/domain/Message';

import { MessageResource } from '../resources/MessageResource';

export class MessageViewModel {
  constructor(private readonly message: Message) {}

  public toResource(): MessageResource {
    const primitives = this.message.toPrimitives();

    return {
      attachmentExternalIdentifiers: primitives.attachmentExternalIdentifiers,
      authorIdentityId: primitives.authorId,
      conversationId: primitives.conversationId,
      createdAt: primitives.createdAt,
      encryptedPayload:
        'encryptedPayload' in primitives &&
        typeof primitives.encryptedPayload === 'string'
          ? primitives.encryptedPayload
          : undefined,
      id: primitives.id,
      previousMessageIds: primitives.previousMessageIds,
      replyToMessageId: primitives.replyToMessageId,
      targetMessageId: primitives.targetMessageId,
      type: primitives.type,
    };
  }
}
