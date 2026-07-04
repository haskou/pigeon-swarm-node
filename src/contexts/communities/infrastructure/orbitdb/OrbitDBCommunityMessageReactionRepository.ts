import { CommunityChannelMessageReaction } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessageReaction';
import CommunityMessageReactionRepository from '@app/contexts/communities/domain/repositories/CommunityMessageReactionRepository';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '@app/contexts/communities/domain/value-objects/CommunityChannelMessageId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { OrbitDBHeadIndex } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBHeadIndex';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { OrbitDBCommunityChannelMessageReactionDocument } from './documents/OrbitDBCommunityChannelMessageReactionDocument';
import OrbitDBCommunityChannelMessageReactionMapper from './mappers/OrbitDBCommunityChannelMessageReactionMapper';

export default class OrbitDBCommunityMessageReactionRepository extends CommunityMessageReactionRepository {
  private readonly reactionIndex: OrbitDBHeadIndex<OrbitDBCommunityChannelMessageReactionDocument>;

  constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly mapper: OrbitDBCommunityChannelMessageReactionMapper,
  ) {
    super();
    this.reactionIndex = new OrbitDBHeadIndex(this.registry, {
      collectionName: 'reactions',
      documentFromRecord: (record) =>
        this.isDocument(record) ? record : undefined,
      recordId: (record) =>
        typeof record.id === 'string' ? record.id : undefined,
      shouldReplace: (current, candidate) =>
        this.freshness(current) <= this.freshness(candidate),
    });
  }

  private documentId(reaction: CommunityChannelMessageReaction): string {
    const primitives = reaction.toPrimitives();

    return [
      'community_channel',
      primitives.communityId,
      primitives.channelId,
      primitives.messageId,
      primitives.authorIdentityId,
      primitives.emoji,
    ].join(':');
  }

  private hasStringFields(
    value: Record<string, unknown>,
    fields: string[],
  ): boolean {
    return fields.every((field) => typeof value[field] === 'string');
  }

  private isDocument(
    value: Record<string, unknown>,
  ): value is OrbitDBCommunityChannelMessageReactionDocument {
    return (
      value.removed !== true &&
      value.scopeType === 'community_channel' &&
      this.hasStringFields(value, [
        'authorIdentityId',
        'channelId',
        'communityId',
        'emoji',
        'id',
        'messageId',
      ]) &&
      typeof value.createdAt === 'number'
    );
  }

  private indexHeadKey(communityId: CommunityId): string {
    return `community-reaction-index:${communityId.valueOf()}`;
  }

  private freshness(document: Record<string, unknown>): number {
    return Math.max(
      typeof document.updatedAt === 'number' ? document.updatedAt : 0,
      typeof document.createdAt === 'number' ? document.createdAt : 0,
    );
  }

  private putIndexDocument(
    communityId: CommunityId,
    document: Record<string, unknown>,
  ): void {
    const key = this.indexHeadKey(communityId);

    void this.reactionIndex.replicateRecordInBackground(
      key,
      {
        communityId: communityId.valueOf(),
        id: key,
      },
      document,
    );
  }

  public async save(reaction: CommunityChannelMessageReaction): Promise<void> {
    const document = this.mapper.toDocument(
      reaction,
      this.documentId(reaction),
    );

    await this.registry.putDocument('reactions', document);
    this.putIndexDocument(new CommunityId(document.communityId), document);
  }

  public async delete(
    reaction: CommunityChannelMessageReaction,
  ): Promise<void> {
    const document = {
      ...this.mapper.toDocument(reaction, this.documentId(reaction)),
      removed: true,
      updatedAt: Date.now(),
    };

    await this.registry.putDocument('reactions', document);
    this.putIndexDocument(new CommunityId(document.communityId), document);
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
    if (messageIds.length === 0 || channelIds.length === 0) {
      return [];
    }

    const channelIdValues = new Set(
      channelIds.map((channelId) => channelId.valueOf()),
    );
    const messageIdValues = new Set(
      messageIds.map((messageId) => messageId.valueOf()),
    );
    const indexedDocuments = await this.reactionIndex.find(
      this.indexHeadKey(communityId),
    );
    const documents = indexedDocuments ?? [];

    return documents
      .filter(
        (
          document,
        ): document is OrbitDBCommunityChannelMessageReactionDocument =>
          this.isDocument(document),
      )
      .filter(
        (document) =>
          channelIdValues.has(document.channelId) &&
          messageIdValues.has(document.messageId),
      )
      .sort((left, right) => left.createdAt - right.createdAt)
      .map((document) => this.mapper.toDomain(document));
  }

  public async findByCommunity(
    communityId: CommunityId,
    limit: number,
  ): Promise<CommunityChannelMessageReaction[]> {
    const indexedDocuments = await this.reactionIndex.find(
      this.indexHeadKey(communityId),
    );
    const documents = indexedDocuments ?? [];

    return documents
      .filter(
        (
          document,
        ): document is OrbitDBCommunityChannelMessageReactionDocument =>
          this.isDocument(document),
      )
      .sort((left, right) => left.createdAt - right.createdAt)
      .slice(-limit)
      .map((document) => this.mapper.toDomain(document));
  }

  public async deleteByChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): Promise<void> {
    const documents =
      (await this.reactionIndex.find(this.indexHeadKey(communityId)))?.filter(
        (
          document,
        ): document is OrbitDBCommunityChannelMessageReactionDocument =>
          this.isDocument(document) &&
          new CommunityChannelId(document.channelId).isEqual(channelId),
      ) ?? [];

    await Promise.all(
      documents.map(async (document) => {
        const tombstone = {
          ...document,
          removed: true,
          updatedAt: Date.now(),
        };

        await this.registry.putDocument('reactions', tombstone);
        this.putIndexDocument(communityId, tombstone);
      }),
    );
  }

  public async deleteByCommunity(communityId: CommunityId): Promise<void> {
    const documents =
      (await this.reactionIndex.find(this.indexHeadKey(communityId))) ?? [];

    await Promise.all(
      documents
        .filter(
          (
            document,
          ): document is OrbitDBCommunityChannelMessageReactionDocument =>
            this.isDocument(document),
        )
        .map(async (document) => {
          const tombstone = {
            ...document,
            removed: true,
            updatedAt: Date.now(),
          };

          await this.registry.putDocument('reactions', tombstone);
          this.putIndexDocument(communityId, tombstone);
        }),
    );
  }
}
