import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';

import { CommunityChannelMessage } from '../../domain/entities/messages/CommunityChannelMessage';
import { CommunityChannelId } from '../../domain/value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '../../domain/value-objects/CommunityChannelMessageId';
import { CommunityId } from '../../domain/value-objects/CommunityId';
import { MongoCommunityChannelMessageDocument } from './documents/MongoCommunityChannelMessageDocument';
import { CommunityChannelThreadSummary } from './types/CommunityChannelThreadSummary';
import { CommunityChannelThreadSummaryDocument } from './types/CommunityChannelThreadSummaryDocument';

export { CommunityChannelThreadSummary } from './types/CommunityChannelThreadSummary';

export class MongoCommunityChannelMessageRepository {
  private static readonly COLLECTION = 'community_channel_messages';
  private static readonly THREAD_SUMMARY_CANDIDATE_MULTIPLIER = 25;
  private static readonly REGEX_SPECIAL_CHARACTERS = /[.*+?^${}()|[\]\\]/g;

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
      editedAt: primitives.editedAt,
      encryptedPayload: primitives.encryptedPayload,
      mentions: primitives.mentions,
      plaintextPayload: primitives.plaintextPayload,
      pollId: primitives.pollId,
      replyToMessageId: primitives.replyToMessageId,
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
      editedAt: document.editedAt,
      encryptedPayload: document.encryptedPayload,
      id: document._id,
      mentions: document.mentions || [],
      plaintextPayload: document.plaintextPayload,
      pollId: document.pollId,
      replyToMessageId: document.replyToMessageId,
      signature: document.signature,
      type: document.type,
    });
  }

  private escapeRegex(value: string): string {
    return value.replace(
      MongoCommunityChannelMessageRepository.REGEX_SPECIAL_CHARACTERS,
      '\\$&',
    );
  }

  private threadSummaryCandidateLimit(
    channelIds: CommunityChannelId[],
    limitPerChannel: number,
  ): number {
    return (
      channelIds.length *
      limitPerChannel *
      MongoCommunityChannelMessageRepository.THREAD_SUMMARY_CANDIDATE_MULTIPLIER
    );
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

  public async findByCommunity(
    communityId: CommunityId,
    limit: number,
  ): Promise<CommunityChannelMessage[]> {
    const documents = await (
      await this.collection()
    )
      .find({
        communityId: communityId.valueOf(),
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    return documents.reverse().map((document) => this.toDomain(document));
  }

  public async findSyncableByCommunity(
    communityId: CommunityId,
    limit: number,
  ): Promise<CommunityChannelMessage[]> {
    const documents = await (
      await this.collection()
    )
      .find({
        $or: [
          { plaintextPayload: { $exists: false } },
          { plaintextPayload: null },
        ],
        communityId: communityId.valueOf(),
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    return documents.reverse().map((document) => this.toDomain(document));
  }

  public async findThreadMessages(
    communityId: CommunityId,
    channelId: CommunityChannelId,
    rootMessageId: CommunityChannelMessageId,
    limit: number,
  ): Promise<CommunityChannelMessage[]> {
    const documents = await (
      await this.collection()
    )
      .find({
        channelId: channelId.valueOf(),
        communityId: communityId.valueOf(),
        replyToMessageId: rootMessageId.valueOf(),
      })
      .sort({ createdAt: 1 })
      .limit(limit)
      .toArray();

    return documents.map((document) => this.toDomain(document));
  }

  public async findThreadSummariesByChannel(
    communityId: CommunityId,
    channelIds: CommunityChannelId[],
    limitPerChannel: number,
  ): Promise<Map<string, CommunityChannelThreadSummary[]>> {
    if (channelIds.length === 0) {
      return new Map();
    }

    const summaries = await (
      await this.collection()
    )
      .aggregate<CommunityChannelThreadSummaryDocument>([
        {
          $match: {
            channelId: {
              $in: channelIds.map((channelId) => channelId.valueOf()),
            },
            communityId: communityId.valueOf(),
            replyToMessageId: { $exists: true, $ne: null },
          },
        },
        { $sort: { createdAt: -1 } },
        {
          $limit: this.threadSummaryCandidateLimit(channelIds, limitPerChannel),
        },
        {
          $group: {
            _id: {
              channelId: '$channelId',
              rootMessageId: '$replyToMessageId',
            },
            lastReplyAt: { $first: '$createdAt' },
            lastReplyMessageId: { $first: '$_id' },
            replyCount: { $sum: 1 },
          },
        },
        { $sort: { lastReplyAt: -1 } },
        {
          $lookup: {
            as: 'rootMessages',
            from: MongoCommunityChannelMessageRepository.COLLECTION,
            let: {
              channelId: '$_id.channelId',
              communityId: communityId.valueOf(),
              rootMessageId: '$_id.rootMessageId',
            },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$_id', '$$rootMessageId'] },
                      { $eq: ['$channelId', '$$channelId'] },
                      { $eq: ['$communityId', '$$communityId'] },
                    ],
                  },
                },
              },
              { $limit: 1 },
            ],
          },
        },
        { $match: { rootMessages: { $ne: [] } } },
      ])
      .toArray();
    const summariesByChannelId = new Map<
      string,
      CommunityChannelThreadSummary[]
    >();

    for (const summary of summaries) {
      const channelSummaries =
        summariesByChannelId.get(summary._id.channelId) || [];

      if (channelSummaries.length >= limitPerChannel) {
        continue;
      }

      channelSummaries.push({
        lastReplyAt: summary.lastReplyAt,
        lastReplyMessageId: summary.lastReplyMessageId,
        replyCount: summary.replyCount,
        rootMessageId: summary._id.rootMessageId,
      });
      summariesByChannelId.set(summary._id.channelId, channelSummaries);
    }

    return summariesByChannelId;
  }

  public async searchPublicByChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
    query: string,
    limit: number,
  ): Promise<CommunityChannelMessage[]> {
    return this.searchPublicByChannels(communityId, [channelId], query, limit);
  }

  public async searchPublicByChannels(
    communityId: CommunityId,
    channelIds: CommunityChannelId[],
    query: string,
    limit: number,
  ): Promise<CommunityChannelMessage[]> {
    const trimmedQuery = query.trim();

    if (!trimmedQuery || channelIds.length === 0) {
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
        plaintextPayload: {
          $options: 'i',
          $regex: this.escapeRegex(trimmedQuery),
        },
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

  public async delete(
    communityId: CommunityId,
    channelId: CommunityChannelId,
    messageId: CommunityChannelMessageId,
  ): Promise<void> {
    await (
      await this.collection()
    ).deleteOne({
      _id: messageId.valueOf(),
      channelId: channelId.valueOf(),
      communityId: communityId.valueOf(),
    });
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
