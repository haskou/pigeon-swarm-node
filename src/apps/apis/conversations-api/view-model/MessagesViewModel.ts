import { Message } from '@app/contexts/conversations/domain/Message';

import { MessagesResource } from '../resources/MessagesResource';
import { MessageViewModel } from './MessageViewModel';

export class MessagesViewModel {
  constructor(
    private readonly conversationId: string,
    private readonly messages: Message[],
  ) {}

  public toResource(): MessagesResource {
    const firstMessage = this.messages[0];

    return {
      conversationId: this.conversationId,
      messages: this.messages.map((message) =>
        new MessageViewModel(message).toResource(),
      ),
      nextBeforeMessageId: firstMessage?.getId().valueOf(),
    };
  }
}
