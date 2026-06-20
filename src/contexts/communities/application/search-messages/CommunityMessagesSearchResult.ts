import { CommunityChannelMessage } from '../../domain/entities/messages/CommunityChannelMessage';
import { CommunityChannelMessageReaction } from '../../domain/entities/messages/CommunityChannelMessageReaction';

export class CommunityMessagesSearchResult {
  constructor(
    private readonly messages: CommunityChannelMessage[],
    private readonly reactions: CommunityChannelMessageReaction[],
  ) {}

  public getMessages(): CommunityChannelMessage[] {
    return [...this.messages];
  }

  public getReactions(): CommunityChannelMessageReaction[] {
    return [...this.reactions];
  }
}
