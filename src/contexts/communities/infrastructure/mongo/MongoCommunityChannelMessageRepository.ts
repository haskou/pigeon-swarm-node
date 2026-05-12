import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';

import { CommunityChannelMessage } from '../../domain/CommunityChannelMessage';
import { CommunityChannelId } from '../../domain/value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '../../domain/value-objects/CommunityChannelMessageId';
import { CommunityId } from '../../domain/value-objects/CommunityId';
import { MongoCommunityChannelMessageDocument } from './documents/MongoCommunityChannelMessageDocument';

export class MongoCommunityChannelMessageRepository {
  private static readonly COLLECTION = 'community_channel_messages';

  constructor(private readonly mongo: MongoDB) {}

  private async collection() {
    return this.mongo.getCollection<MongoCommunityChannelMessageDocument>(
      MongoCommunityChannelMessageRepository.COLLECTION,
    );
  }

  private toDocument(
    message: CommunityChannelMessage,
  ): MongoCommunityChannelMessageDocument {
    const primitives = message.toPrimitives();

    return {
      _id: primitives.id,
      attachmentExternalIdentifiers: primitives.attachmentExternalIdentifiers,
      authorIdentityId: primitives.authorIdentityId,
      channelId: primitives.channelId,
      communityId: primitives.communityId,
      createdAt: primitives.createdAt,
      encryptedPayload: primitives.encryptedPayload,
      signature: primitives.signature,
      type: primitives.type,
    };
  }

  private toDomain(
    document: MongoCommunityChannelMessageDocument,
  ): CommunityChannelMessage {
    return CommunityChannelMessage.fromPrimitives({
      attachmentExternalIdentifiers: document.attachmentExternalIdentifiers,
      authorIdentityId: document.authorIdentityId,
      channelId: document.channelId,
      communityId: document.communityId,
      createdAt: document.createdAt,
      encryptedPayload: document.encryptedPayload,
      id: document._id,
      signature: document.signature,
      type: document.type,
    });
  }

  public async findById(
    communityId: CommunityId,
    channelId: CommunityChannelId,
    messageId: CommunityChannelMessageId,
  ): Promise<CommunityChannelMessage | undefined> {
    const document = await (
      await this.collection()
    ).findOne({
      _id: messageId.valueOf(),
      channelId: channelId.valueOf(),
      communityId: communityId.valueOf(),
    });

    return document ? this.toDomain(document) : undefined;
  }

  public async findByChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
    limit: number,
    beforeMessageId?: CommunityChannelMessageId,
  ): Promise<CommunityChannelMessage[]> {
    const beforeMessage = beforeMessageId
      ? await this.findById(communityId, channelId, beforeMessageId)
      : undefined;
    const beforeCreatedAt = beforeMessage?.toPrimitives().createdAt;
    const documents = await (
      await this.collection()
    )
      .find({
        channelId: channelId.valueOf(),
        communityId: communityId.valueOf(),
        ...(beforeCreatedAt ? { createdAt: { $lt: beforeCreatedAt } } : {}),
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    return documents.reverse().map((document) => this.toDomain(document));
  }

  public async save(message: CommunityChannelMessage): Promise<void> {
    const document = this.toDocument(message);

    await (
      await this.collection()
    ).updateOne({ _id: document._id }, { $set: document }, { upsert: true });
  }
}
