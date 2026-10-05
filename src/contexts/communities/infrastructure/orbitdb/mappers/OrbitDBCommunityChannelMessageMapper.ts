import { CommunityChannelMessageRecordId } from '@app/contexts/communities/domain/CommunityChannelMessageRecordId';
import { CommunityChannelMessage } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessage';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '@app/contexts/communities/domain/value-objects/CommunityChannelMessageId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { OrbitDBCommunityChannelMessageDocument } from '../documents/OrbitDBCommunityChannelMessageDocument';

export default class OrbitDBCommunityChannelMessageMapper {
  public toDocument(
    message: CommunityChannelMessage,
  ): OrbitDBCommunityChannelMessageDocument {
    const primitives = message.toPrimitives();

    const document = {
      authorIdentityId: primitives.authorIdentityId,
      channelId: primitives.channelId,
      communityId: primitives.communityId,
      createdAt: primitives.createdAt,
      editedAt: primitives.editedAt,
      encryptedPayload: primitives.encryptedPayload,
      id: CommunityChannelMessageRecordId.of(
        new CommunityId(primitives.communityId),
        new CommunityChannelId(primitives.channelId),
        new CommunityChannelMessageId(primitives.id),
        new IdentityId(primitives.authorIdentityId),
      ),
      mentions: primitives.mentions.map((mention) =>
        mention.targetId === undefined
          ? { type: mention.type }
          : { targetId: mention.targetId, type: mention.type },
      ),
      messageId: primitives.id,
      plaintextPayload: primitives.plaintextPayload,
      pollId: primitives.pollId,
      replyToMessageId: primitives.replyToMessageId,
      scopeType: 'community_channel',
      type: primitives.type,
    };

    // Undefined fields are not part of the signed record.
    return Object.fromEntries(
      Object.entries(document).filter(([, value]) => value !== undefined),
    ) as unknown as OrbitDBCommunityChannelMessageDocument;
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
      id: document.messageId,
      mentions: document.mentions || [],
      plaintextPayload: document.plaintextPayload,
      pollId: document.pollId,
      replyToMessageId: document.replyToMessageId,
      type: document.type,
    });
  }
}
