import { CommunityChannelMessageReaction } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessageReaction';
import CommunityMessageReactionRepository from '@app/contexts/communities/domain/repositories/CommunityMessageReactionRepository';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '@app/contexts/communities/domain/value-objects/CommunityChannelMessageId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { OrbitDBCommunityChannelMessageReactionDocument } from './documents/OrbitDBCommunityChannelMessageReactionDocument';
import OrbitDBCommunityChannelMessageReactionMapper from './mappers/OrbitDBCommunityChannelMessageReactionMapper';

// eslint-disable-next-line max-len
export default class OrbitDBCommunityMessageReactionRepository extends CommunityMessageReactionRepository {
  constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly mapper: OrbitDBCommunityChannelMessageReactionMapper,
  ) {
    super();
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

  private async findDocuments(
    matcher: (
      document: OrbitDBCommunityChannelMessageReactionDocument,
    ) => boolean,
  ): Promise<OrbitDBCommunityChannelMessageReactionDocument[]> {
    const documents = await this.registry.queryDocuments(
      'reactions',
      (document) => this.isDocument(document) && matcher(document),
    );

    return documents
      .filter(
        (
          document,
        ): document is OrbitDBCommunityChannelMessageReactionDocument =>
          this.isDocument(document),
      )
      .sort((left, right) => left.createdAt - right.createdAt);
  }

  public async save(reaction: CommunityChannelMessageReaction): Promise<void> {
    await this.registry.putDocument(
      'reactions',
      this.mapper.toDocument(reaction, this.documentId(reaction)),
    );
  }

  public async delete(
    reaction: CommunityChannelMessageReaction,
  ): Promise<void> {
    await this.registry.putDocument('reactions', {
      ...this.mapper.toDocument(reaction, this.documentId(reaction)),
      removed: true,
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
    if (messageIds.length === 0 || channelIds.length === 0) {
      return [];
    }

    const channelIdValues = new Set(
      channelIds.map((channelId) => channelId.valueOf()),
    );
    const messageIdValues = new Set(
      messageIds.map((messageId) => messageId.valueOf()),
    );
    const documents = await this.findDocuments(
      (document) =>
        new CommunityId(document.communityId).isEqual(communityId) &&
        channelIdValues.has(document.channelId) &&
        messageIdValues.has(document.messageId),
    );

    return documents.map((document) => this.mapper.toDomain(document));
  }

  public async findByCommunity(
    communityId: CommunityId,
    limit: number,
  ): Promise<CommunityChannelMessageReaction[]> {
    const documents = await this.findDocuments((document) =>
      new CommunityId(document.communityId).isEqual(communityId),
    );

    return documents
      .slice(-limit)
      .map((document) => this.mapper.toDomain(document));
  }

  public async deleteByChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): Promise<void> {
    const documents = await this.findDocuments(
      (document) =>
        new CommunityId(document.communityId).isEqual(communityId) &&
        new CommunityChannelId(document.channelId).isEqual(channelId),
    );

    await Promise.all(
      documents.map((document) =>
        this.registry.putDocument('reactions', {
          ...document,
          removed: true,
        }),
      ),
    );
  }

  public async deleteByCommunity(communityId: CommunityId): Promise<void> {
    const documents = await this.findDocuments((document) =>
      new CommunityId(document.communityId).isEqual(communityId),
    );

    await Promise.all(
      documents.map((document) =>
        this.registry.putDocument('reactions', {
          ...document,
          removed: true,
        }),
      ),
    );
  }
}
