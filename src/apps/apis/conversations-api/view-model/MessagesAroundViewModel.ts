import { ConversationMessagesAround } from '@app/contexts/conversations/domain/repositories/ConversationRepository';

import { MessagesAroundResource } from '../resources/MessagesResource';
import { MessageViewModel } from './MessageViewModel';

export class MessagesAroundViewModel {
  constructor(private readonly around: ConversationMessagesAround) {}

  public toResource(): MessagesAroundResource {
    return {
      messages: this.around.messages.map((message) =>
        new MessageViewModel(message).toResource(),
      ),
      nextCursor: this.around.nextCursor,
      previousCursor: this.around.previousCursor,
    };
  }
}
