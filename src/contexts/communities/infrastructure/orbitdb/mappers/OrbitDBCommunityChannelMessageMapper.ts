import { CommunityChannelMessage } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessage';

import { OrbitDBCommunityChannelMessageDocument } from '../documents/OrbitDBCommunityChannelMessageDocument';

export default class OrbitDBCommunityChannelMessageMapper {
  public toDocument(
    message: CommunityChannelMessage,
  ): OrbitDBCommunityChannelMessageDocument {
    const primitives = message.toPrimitives();

    return {
      authorIdentityId: primitives.authorIdentityId,
      channelId: primitives.channelId,
      communityId: primitives.communityId,
      createdAt: primitives.createdAt,
      editedAt: primitives.editedAt,
      encryptedPayload: primitives.encryptedPayload,
      id: primitives.id,
      mentions: primitives.mentions,
      messageId: primitives.id,
      plaintextPayload: primitives.plaintextPayload,
      pollId: primitives.pollId,
      replyToMessageId: primitives.replyToMessageId,
      scopeType: 'community_channel',
      signature: primitives.signature,
      type: primitives.type,
    };
  }

  public toDomain(
    document: OrbitDBCommunityChannelMessageDocument,
  ): CommunityChannelMessage {
    return CommunityChannelMessage.fromPrimitives({
      authorIdentityId: document.authorIdentityId,
      channelId: document.channelId,
      communityId: document.communityId,
      createdAt: document.createdAt,
      editedAt: document.editedAt,
      encryptedPayload: document.encryptedPayload,
      id: document.messageId || document.id,
      mentions: document.mentions || [],
      plaintextPayload: document.plaintextPayload,
      pollId: document.pollId,
      replyToMessageId: document.replyToMessageId,
      signature: document.signature,
      type: document.type,
    });
  }
}
