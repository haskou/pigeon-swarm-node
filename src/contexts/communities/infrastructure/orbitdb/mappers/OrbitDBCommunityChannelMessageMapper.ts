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
    const {
      editedAt,
      encryptedPayload,
      plaintextPayload,
      pollId,
      replyToMessageId,
    } = primitives;

    // Undefined fields are not part of the signed record.
    return {
      authorIdentityId: primitives.authorIdentityId,
      channelId: primitives.channelId,
      communityId: primitives.communityId,
      createdAt: primitives.createdAt,
      ...(editedAt === undefined ? {} : { editedAt }),
      ...(encryptedPayload === undefined ? {} : { encryptedPayload }),
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
      ...(plaintextPayload === undefined ? {} : { plaintextPayload }),
      ...(pollId === undefined ? {} : { pollId }),
      ...(replyToMessageId === undefined ? {} : { replyToMessageId }),
      scopeType: 'community_channel',
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
      id: document.messageId,
      mentions: (document.mentions || []).map((mention) => ({
        targetId: mention.targetId,
        type: mention.type,
      })),
      plaintextPayload: document.plaintextPayload,
      pollId: document.pollId,
      replyToMessageId: document.replyToMessageId,
      type: document.type,
    });
  }
}
