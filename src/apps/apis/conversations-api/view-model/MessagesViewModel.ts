import { Message } from '@app/contexts/conversations/domain/Message';

import { ConversationCallEventResource } from '../resources/ConversationCallEventResource';
import {
  ConversationTimelineItemResource,
  MessagesResource,
} from '../resources/MessagesResource';
import { MessageViewModel } from './MessageViewModel';

export class MessagesViewModel {
  constructor(
    private readonly conversationId: string,
    private readonly messages: Message[],
    private readonly callEvents: ConversationCallEventResource[] = [],
  ) {}

  public toResource(): MessagesResource {
    const firstMessage = this.messages[0];
    const messages = this.messages.map((message) =>
      new MessageViewModel(message).toResource(),
    );
    const timeline: ConversationTimelineItemResource[] = [
      ...messages,
      ...this.callEvents,
    ].sort((first, second) => first.createdAt - second.createdAt);

    return {
      conversationId: this.conversationId,
      messages: timeline,
      nextBeforeMessageId: firstMessage?.getId().valueOf(),
    };
  }
}
