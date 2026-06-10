import { CommunityChannelMessageReaction } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessageReaction';

import { OrbitDBCommunityChannelMessageReactionDocument } from '../documents/OrbitDBCommunityChannelMessageReactionDocument';

export default class OrbitDBCommunityChannelMessageReactionMapper {
  public toDocument(
    reaction: CommunityChannelMessageReaction,
    id: string,
  ): OrbitDBCommunityChannelMessageReactionDocument {
    const primitives = reaction.toPrimitives();

    return {
      authorIdentityId: primitives.authorIdentityId,
      channelId: primitives.channelId,
      communityId: primitives.communityId,
      createdAt: primitives.createdAt,
      emoji: primitives.emoji,
      id,
      messageId: primitives.messageId,
      scopeType: 'community_channel',
    };
  }

  public toDomain(
    document: OrbitDBCommunityChannelMessageReactionDocument,
  ): CommunityChannelMessageReaction {
    return CommunityChannelMessageReaction.fromPrimitives({
      authorIdentityId: document.authorIdentityId,
      channelId: document.channelId,
      communityId: document.communityId,
      createdAt: document.createdAt,
      emoji: document.emoji,
      messageId: document.messageId,
    });
  }
}
