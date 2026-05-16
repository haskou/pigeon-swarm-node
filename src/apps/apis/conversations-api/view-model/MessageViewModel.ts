import { Message } from '@app/contexts/conversations/domain/Message';
import { MessageReaction } from '@app/contexts/conversations/domain/MessageReaction';

import { MessageResource } from '../resources/MessageResource';
import { MessageReactionViewModel } from './MessageReactionViewModel';

export class MessageViewModel {
  constructor(
    private readonly message: Message,
    private readonly reactions: MessageReaction[] = [],
  ) {}

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
      reactions: this.reactions.map((reaction) =>
        new MessageReactionViewModel(reaction).toResource(),
      ),
      replyToMessageId: primitives.replyToMessageId,
      targetMessageId: primitives.targetMessageId,
      type: primitives.type,
    };
  }
}
