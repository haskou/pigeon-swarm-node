import { CommunityChannelMessage } from '@app/contexts/communities/domain/CommunityChannelMessage';
import { CommunityChannelMessageReaction } from '@app/contexts/communities/domain/CommunityChannelMessageReaction';

import { CommunityChannelMessagesResource } from '../resources/CommunityChannelMessagesResource';
import { CommunityChannelMessageViewModel } from './CommunityChannelMessageViewModel';

export class CommunityChannelMessagesViewModel {
  constructor(
    private readonly communityId: string,
    private readonly channelId: string,
    private readonly messages: CommunityChannelMessage[],
    private readonly reactions: CommunityChannelMessageReaction[] = [],
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
    const firstMessage = messageResources.at(0);

    return {
      channelId: this.channelId,
      communityId: this.communityId,
      messages: messageResources,
      nextBeforeMessageId: firstMessage?.id,
    };
  }
}
