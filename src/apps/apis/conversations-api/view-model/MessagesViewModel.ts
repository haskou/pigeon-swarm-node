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
    private readonly limit: number = 50,
  ) {}

  public toResource(): MessagesResource {
    const messages = this.messages.map((message) =>
      new MessageViewModel(message).toResource(),
    );
    const lowerBound = messages.at(0)?.createdAt;
    const upperBound = messages.at(-1)?.createdAt;
    const callEvents = this.callEvents.filter((event) => {
      if (lowerBound === undefined || upperBound === undefined) {
        return true;
      }

      return event.createdAt >= lowerBound && event.createdAt <= upperBound;
    });
    const timeline: ConversationTimelineItemResource[] = [
      ...messages,
      ...callEvents,
    ]
      .sort((first, second) => first.createdAt - second.createdAt)
      .slice(-this.limit);
    const firstReturnedMessage = timeline.find(
      (item) => item.type !== 'call_event',
    );

    return {
      conversationId: this.conversationId,
      messages: timeline,
      nextBeforeMessageId: firstReturnedMessage?.id,
    };
  }
}
