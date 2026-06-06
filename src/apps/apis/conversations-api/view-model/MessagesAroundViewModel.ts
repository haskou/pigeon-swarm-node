import { Message } from '@app/contexts/conversations/domain/Message';
import { MessageReaction } from '@app/contexts/conversations/domain/MessageReaction';
import { ConversationMessagesAround } from '@app/contexts/conversations/domain/repositories/types/ConversationMessagesAround';

import { MessagesAroundResource } from '../resources/MessagesResource';
import { MessageViewModel } from './MessageViewModel';

export class MessagesAroundViewModel {
  constructor(
    private readonly around: ConversationMessagesAround,
    private readonly reactions: MessageReaction[] = [],
  ) {}

  private reactionsFor(message: Message): MessageReaction[] {
    return this.reactions.filter((reaction) =>
      reaction.getMessageId().isEqual(message.getId()),
    );
  }

  public toResource(): MessagesAroundResource {
    return {
      messages: this.around.messages.map((message) =>
        new MessageViewModel(message, this.reactionsFor(message)).toResource(),
      ),
      nextCursor: this.around.nextCursor,
      previousCursor: this.around.previousCursor,
    };
  }
}
