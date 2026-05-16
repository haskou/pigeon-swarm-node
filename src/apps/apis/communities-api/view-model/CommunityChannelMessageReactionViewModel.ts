import { CommunityChannelMessageReaction } from '@app/contexts/communities/domain/CommunityChannelMessageReaction';

import { CommunityChannelMessageReactionResource } from '../resources/CommunityChannelMessageReactionResource';

export class CommunityChannelMessageReactionViewModel {
  constructor(private readonly reaction: CommunityChannelMessageReaction) {}

  public toResource(): CommunityChannelMessageReactionResource {
    const primitives = this.reaction.toPrimitives();

    return {
      authorIdentityId: primitives.authorIdentityId,
      createdAt: primitives.createdAt,
      emoji: primitives.emoji,
    };
  }
}
