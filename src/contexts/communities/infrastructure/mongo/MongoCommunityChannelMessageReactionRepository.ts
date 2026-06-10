import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
import { createHash } from 'node:crypto';

import { CommunityChannelMessageReaction } from '../../domain/entities/messages/CommunityChannelMessageReaction';
import CommunityMessageReactionRepository from '../../domain/repositories/CommunityMessageReactionRepository';
import { CommunityChannelId } from '../../domain/value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '../../domain/value-objects/CommunityChannelMessageId';
import { CommunityId } from '../../domain/value-objects/CommunityId';
import { MongoCommunityChannelMessageReactionDocument } from './documents/MongoCommunityChannelMessageReactionDocument';

// eslint-disable-next-line max-len
export default class MongoCommunityMessageReactionRepository extends CommunityMessageReactionRepository {
  private static readonly COLLECTION = 'community_channel_message_reactions';

  constructor(private readonly mongo: MongoDB) {
    super();
  }

  private async collection() {
    // eslint-disable-next-line max-len
    return this.mongo.getCollection<MongoCommunityChannelMessageReactionDocument>(
      MongoCommunityMessageReactionRepository.COLLECTION,
    );
  }

  private documentId(reaction: CommunityChannelMessageReaction): string {
    const primitives = reaction.toPrimitives();

    return createHash('sha256')
      .update(
        JSON.stringify({
          authorIdentityId: primitives.authorIdentityId,
          channelId: primitives.channelId,
          communityId: primitives.communityId,
          emoji: primitives.emoji,
          messageId: primitives.messageId,
        }),
      )
      .digest('hex');
  }

  private toDocument(
    reaction: CommunityChannelMessageReaction,
  ): MongoCommunityChannelMessageReactionDocument {
    const primitives = reaction.toPrimitives();

    return {
      _id: this.documentId(reaction),
      authorIdentityId: primitives.authorIdentityId,
      channelId: primitives.channelId,
      communityId: primitives.communityId,
      createdAt: primitives.createdAt,
      emoji: primitives.emoji,
      messageId: primitives.messageId,
    };
  }

  private toDomain(
    document: MongoCommunityChannelMessageReactionDocument,
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

  public async save(reaction: CommunityChannelMessageReaction): Promise<void> {
    const document = this.toDocument(reaction);

    await (
      await this.collection()
    ).updateOne(
      { _id: document._id },
      { $setOnInsert: document },
      { upsert: true },
    );
  }

  public async delete(
    reaction: CommunityChannelMessageReaction,
  ): Promise<void> {
    await (
      await this.collection()
    ).deleteOne({
      _id: this.documentId(reaction),
    });
  }

  public async findByMessageIds(
    communityId: CommunityId,
    channelId: CommunityChannelId,
    messageIds: CommunityChannelMessageId[],
  ): Promise<CommunityChannelMessageReaction[]> {
    return this.findByMessageIdsInChannels(
      communityId,
      [channelId],
      messageIds,
    );
  }

  public async findByMessageIdsInChannels(
    communityId: CommunityId,
    channelIds: CommunityChannelId[],
    messageIds: CommunityChannelMessageId[],
  ): Promise<CommunityChannelMessageReaction[]> {
    if (messageIds.length === 0) {
      return [];
    }

    const documents = await (
      await this.collection()
    )
      .find({
        channelId: {
          $in: channelIds.map((channelId) => channelId.valueOf()),
        },
        communityId: communityId.valueOf(),
        messageId: {
          $in: messageIds.map((messageId) => messageId.valueOf()),
        },
      })
      .sort({ createdAt: 1 })
      .toArray();

    return documents.map((document) => this.toDomain(document));
  }

  public async findByCommunity(
    communityId: CommunityId,
    limit: number,
  ): Promise<CommunityChannelMessageReaction[]> {
    const documents = await (await this.collection())
      .find({ communityId: communityId.valueOf() })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    return documents.reverse().map((document) => this.toDomain(document));
  }

  public async deleteByChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): Promise<void> {
    await (
      await this.collection()
    ).deleteMany({
      channelId: channelId.valueOf(),
      communityId: communityId.valueOf(),
    });
  }

  public async deleteByCommunity(communityId: CommunityId): Promise<void> {
    await (
      await this.collection()
    ).deleteMany({
      communityId: communityId.valueOf(),
    });
  }
}
