import { Call } from '@app/contexts/calls/domain/Call';
import { Poll } from '@app/contexts/polls/domain/Poll';

import { Message } from '../../domain/entities/messages/Message';
import { MessageReaction } from '../../domain/entities/messages/MessageReaction';

export class ConversationMessagesTimeline {
  constructor(
    private readonly messages: Message[],
    private readonly calls: Call[],
    private readonly polls: Poll[],
    private readonly reactions: MessageReaction[],
    private readonly limit: number,
  ) {}

  public getCalls(): Call[] {
    return [...this.calls];
  }

  public getLimit(): number {
    return this.limit;
  }

  public getMessages(): Message[] {
    return [...this.messages];
  }

  public getPolls(): Poll[] {
    return [...this.polls];
  }

  public getReactions(): MessageReaction[] {
    return [...this.reactions];
  }
}
