import { PollViewModel } from '@app/apps/apis/polls-api/view-model/PollViewModel';
import { CommunityChannelMessage } from '@app/contexts/communities/domain/CommunityChannelMessage';
import { CommunityChannelMessageReaction } from '@app/contexts/communities/domain/CommunityChannelMessageReaction';
import { Poll } from '@app/contexts/polls/domain/Poll';

import {
  CommunityChannelMessagesResource,
  CommunityChannelTimelineItemResource,
} from '../resources/CommunityChannelMessagesResource';
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

  private messageResource(
    message: CommunityChannelMessage,
  ): CommunityChannelTimelineItemResource[] {
    const primitives = message.toPrimitives();

    if (primitives.type !== 'poll' || !primitives.pollId) {
      return [
        new CommunityChannelMessageViewModel(
          message,
          this.reactionsFor(message),
        ).toResource(),
      ];
    }

    const poll = this.polls.find(
      (candidate) => candidate.getId().valueOf() === primitives.pollId,
    );

    return poll ? [new PollViewModel(poll).toResource()] : [];
  }

  public toResource(): CommunityChannelMessagesResource {
    const messageResources = this.messages.flatMap((message) =>
      this.messageResource(message),
    );
    const messageIds = new Set(messageResources.map((message) => message.id));
    const pollResources = this.polls
      .filter((poll) => !messageIds.has(poll.getId().valueOf()))
      .map((poll) => new PollViewModel(poll).toResource());
    const timeline = [...messageResources, ...pollResources]
      .sort((first, second) => first.createdAt - second.createdAt)
      .slice(-this.limit);

    return {
      channelId: this.channelId,
      communityId: this.communityId,
      messages: timeline,
      nextBeforeMessageId: timeline[0]?.id,
    };
  }
}
