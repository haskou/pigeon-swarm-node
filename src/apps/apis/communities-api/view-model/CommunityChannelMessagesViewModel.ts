import { PollViewModel } from '@app/apps/apis/polls-api/view-model/PollViewModel';
import { CommunityChannelMessage } from '@app/contexts/communities/domain/CommunityChannelMessage';
import { CommunityChannelMessageReaction } from '@app/contexts/communities/domain/CommunityChannelMessageReaction';
import { Poll } from '@app/contexts/polls/domain/Poll';

import { CommunityChannelMessagesResource } from '../resources/CommunityChannelMessagesResource';
import { CommunityChannelMessageViewModel } from './CommunityChannelMessageViewModel';

export class CommunityChannelMessagesViewModel {
  constructor(
    private readonly communityId: string,
    private readonly channelId: string,
    private readonly messages: CommunityChannelMessage[],
    private readonly reactions: CommunityChannelMessageReaction[] = [],
    private readonly polls: Poll[] = [],
    private readonly limit: number = 50,
  ) {}

  private reactionsFor(
    message: CommunityChannelMessage,
  ): CommunityChannelMessageReaction[] {
    const messageId = message.toPrimitives().id;

    return this.reactions.filter(
      (reaction) => reaction.toPrimitives().messageId === messageId,
    );
  }

  public toResource(): CommunityChannelMessagesResource {
    const messageResources = this.messages.map((message) =>
      new CommunityChannelMessageViewModel(
        message,
        this.reactionsFor(message),
      ).toResource(),
    );
    const pollResources = this.polls.map((poll) =>
      new PollViewModel(poll).toResource(),
    );
    const timeline = [...messageResources, ...pollResources]
      .sort((first, second) => first.createdAt - second.createdAt)
      .slice(-this.limit);
    const firstMessage = timeline.find((item) => item.type !== 'poll');

    return {
      channelId: this.channelId,
      communityId: this.communityId,
      messages: timeline,
      nextBeforeMessageId: firstMessage?.id,
    };
  }
}
