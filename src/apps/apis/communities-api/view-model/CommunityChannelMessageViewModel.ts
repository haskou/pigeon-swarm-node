import { CommunityChannelMessage } from '@app/contexts/communities/domain/CommunityChannelMessage';
import { CommunityChannelMessageReaction } from '@app/contexts/communities/domain/CommunityChannelMessageReaction';

import { CommunityChannelMessageResource } from '../resources/CommunityChannelMessageResource';
import { CommunityChannelMessageReactionViewModel } from './CommunityChannelMessageReactionViewModel';

export class CommunityChannelMessageViewModel {
  constructor(
    private readonly message: CommunityChannelMessage,
    private readonly reactions: CommunityChannelMessageReaction[] = [],
  ) {}

  public toResource(): CommunityChannelMessageResource {
    return {
      ...this.message.toPrimitives(),
      reactions: this.reactions.map((reaction) =>
        new CommunityChannelMessageReactionViewModel(reaction).toResource(),
      ),
    };
  }
}
