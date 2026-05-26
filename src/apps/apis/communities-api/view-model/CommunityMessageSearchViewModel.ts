import { CommunityChannelMessage } from '@app/contexts/communities/domain/CommunityChannelMessage';
import { CommunityChannelMessageReaction } from '@app/contexts/communities/domain/CommunityChannelMessageReaction';

import { CommunityMessageSearchResource } from '../resources/CommunityMessageSearchResource';
import { CommunityChannelMessageViewModel } from './CommunityChannelMessageViewModel';

export class CommunityMessageSearchViewModel {
  constructor(
    private readonly communityId: string,
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

  public toResource(): CommunityMessageSearchResource {
    return {
      communityId: this.communityId,
      messages: this.messages.map((message) =>
        new CommunityChannelMessageViewModel(
          message,
          this.reactionsFor(message),
        ).toResource(),
      ),
    };
  }
}
