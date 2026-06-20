import { ConversationMessagesAround } from '@app/contexts/conversations/domain/ConversationMessagesAround';
import { Message } from '@app/contexts/conversations/domain/entities/messages/Message';
import { MessageReaction } from '@app/contexts/conversations/domain/entities/messages/MessageReaction';

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
      messages: this.around
        .getMessages()
        .map((message) =>
          new MessageViewModel(
            message,
            this.reactionsFor(message),
          ).toResource(),
        ),
      nextCursor: this.around.getNextCursor()?.valueOf(),
      previousCursor: this.around.getPreviousCursor()?.valueOf(),
    };
  }
}
