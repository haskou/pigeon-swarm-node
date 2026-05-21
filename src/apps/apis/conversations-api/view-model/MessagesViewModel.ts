import { Message } from '@app/contexts/conversations/domain/Message';
import { MessageReaction } from '@app/contexts/conversations/domain/MessageReaction';
import { Poll } from '@app/contexts/polls/domain/Poll';

import { PollViewModel } from '../../polls-api/view-model/PollViewModel';
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
    private readonly polls: Poll[] = [],
    private readonly limit: number = 50,
    private readonly reactions: MessageReaction[] = [],
  ) {}

  private reactionsFor(message: Message): MessageReaction[] {
    return this.reactions.filter((reaction) =>
      reaction.getMessageId().isEqual(message.getId()),
    );
  }

  private messageResource(
    message: Message,
  ): ConversationTimelineItemResource[] {
    const primitives = message.toPrimitives();

    if (primitives.type !== 'poll' || !('pollId' in primitives)) {
      return [
        new MessageViewModel(message, this.reactionsFor(message)).toResource(),
      ];
    }

    const poll = this.polls.find(
      (candidate) => candidate.getId().valueOf() === primitives.pollId,
    );

    return poll ? [new PollViewModel(poll).toResource()] : [];
  }

  public toResource(): MessagesResource {
    const messages = this.messages.flatMap((message) =>
      this.messageResource(message),
    );
    const messageIds = new Set(messages.map((message) => message.id));
    const polls = this.polls
      .filter((poll) => !messageIds.has(poll.getId().valueOf()))
      .map((poll) => new PollViewModel(poll).toResource());
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
      ...polls,
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
