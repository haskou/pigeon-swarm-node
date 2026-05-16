import { MessageReaction } from '@app/contexts/conversations/domain/MessageReaction';

import { MessageReactionResource } from '../resources/MessageReactionResource';

export class MessageReactionViewModel {
  constructor(private readonly reaction: MessageReaction) {}

  public toResource(): MessageReactionResource {
    const primitives = this.reaction.toPrimitives();

    return {
      authorIdentityId: primitives.authorId,
      createdAt: primitives.createdAt,
      emoji: primitives.emoji,
    };
  }
}
