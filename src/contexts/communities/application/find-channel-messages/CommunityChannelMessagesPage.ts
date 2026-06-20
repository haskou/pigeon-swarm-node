import { Poll } from '@app/contexts/polls/domain/Poll';

import { CommunityChannelMessage } from '../../domain/entities/messages/CommunityChannelMessage';
import { CommunityChannelMessageReaction } from '../../domain/entities/messages/CommunityChannelMessageReaction';

export class CommunityChannelMessagesPage {
  constructor(
    private readonly messages: CommunityChannelMessage[],
    private readonly reactions: CommunityChannelMessageReaction[],
    private readonly polls: Poll[],
    private readonly limit: number,
  ) {}

  public getLimit(): number {
    return this.limit;
  }

  public getMessages(): CommunityChannelMessage[] {
    return [...this.messages];
  }

  public getPolls(): Poll[] {
    return [...this.polls];
  }

  public getReactions(): CommunityChannelMessageReaction[] {
    return [...this.reactions];
  }
}
