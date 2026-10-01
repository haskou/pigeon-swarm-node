import { CommunityChannelMessageReaction } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessageReaction';
import CommunityMessageReactionRepository from '@app/contexts/communities/domain/repositories/CommunityMessageReactionRepository';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '@app/contexts/communities/domain/value-objects/CommunityChannelMessageId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { PublicMutationRecord } from '@app/contexts/public-mutations/domain/PublicMutationRecord';
import { OrbitDBHeadIndex } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBHeadIndex';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import PrivateCommunityPublicStorageGuard from '../PrivateCommunityPublicStorageGuard';
import { OrbitDBCommunityChannelMessageReactionDocument } from './documents/OrbitDBCommunityChannelMessageReactionDocument';
import OrbitDBCommunityChannelMessageReactionMapper from './mappers/OrbitDBCommunityChannelMessageReactionMapper';

export default class OrbitDBCommunityMessageReactionRepository extends CommunityMessageReactionRepository {
  private readonly reactionIndex: OrbitDBHeadIndex<OrbitDBCommunityChannelMessageReactionDocument>;

  constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly mapper: OrbitDBCommunityChannelMessageReactionMapper,
    private readonly publicStorageGuard: PrivateCommunityPublicStorageGuard,
  ) {
    super();
    this.reactionIndex = new OrbitDBHeadIndex(this.registry, {
      collectionName: 'reactions',
      documentFromRecord: (record) =>
        this.isDocument(record) ? record : undefined,
      recordId: (record) =>
        typeof record.id === 'string' ? record.id : undefined,
      shouldReplace: (current, candidate) =>
        PublicMutationRecord.replaces(current, candidate) ?? true,
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
    const hasRequiredFields =
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
      typeof value.createdAt === 'number';

    if (!hasRequiredFields) return false;
    const candidate = value as OrbitDBCommunityChannelMessageReactionDocument;

    try {
      const reaction = this.mapper.toDomain(candidate);

      return candidate.id === this.documentId(reaction);
    } catch {
      return false;
    }
  }

  private indexHeadKey(communityId: CommunityId): string {
    return this.indexHeadKeyFromValue(communityId.valueOf());
  }

  private indexHeadKeyFromValue(communityId: string): string {
    return `community-reaction-index:${communityId}`;
  }

  private async write(
    payload: Record<string, unknown>,
    proof: PublicMutationProof,
  ): Promise<void> {
    const communityId = new CommunityId(payload.communityId as string);
    const document = PublicMutationRecord.withProof(payload, proof);

    await this.publicStorageGuard.runWhilePublic(communityId, async () => {
      PublicMutationRecord.assertNotStale(
        (
          await this.reactionIndex.findRecords(this.indexHeadKey(communityId))
        ).filter((stored) => stored.id === payload.id),
        document,
      );
      await this.registry.putDocument('reactions', document);
      await this.putIndexDocument(communityId, document);
    });
  }

  private putIndexDocument(
    communityId: CommunityId,
    document: Record<string, unknown>,
  ): Promise<void> {
    const key = this.indexHeadKey(communityId);

    return this.reactionIndex.putRecord(
      key,
      {
        communityId: communityId.valueOf(),
        id: key,
      },
      document,
      [],
      {
        recordFilter: (record) => record.communityId === communityId.valueOf(),
        replace: true,
      },
    );
  }

  public async save(
    reaction: CommunityChannelMessageReaction,
    proof: PublicMutationProof,
  ): Promise<void> {
    await this.write(
      this.mapper.toDocument(reaction, this.documentId(reaction)),
      proof,
    );
  }

  public async delete(
    reaction: CommunityChannelMessageReaction,
    proof: PublicMutationProof,
  ): Promise<void> {
    const document = Object.fromEntries(
      Object.entries(
        this.mapper.toDocument(reaction, this.documentId(reaction)),
      ).filter(([key]) => key !== 'createdAt'),
    );

    await this.write({ ...document, removed: true }, proof);
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
    return this.publicStorageGuard.runWhilePublic(communityId, async () => {
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
            document.communityId === communityId.valueOf() &&
            channelIdValues.has(document.channelId) &&
            messageIdValues.has(document.messageId),
        )
        .sort((left, right) => left.createdAt - right.createdAt)
        .map((document) => this.mapper.toDomain(document));
    });
  }

  public async findByCommunity(
    communityId: CommunityId,
    limit: number,
  ): Promise<CommunityChannelMessageReaction[]> {
    return this.publicStorageGuard.runWhilePublic(communityId, async () => {
      const indexedDocuments = await this.reactionIndex.find(
        this.indexHeadKey(communityId),
      );
      const documents = indexedDocuments ?? [];

      return documents
        .filter(
          (
            document,
          ): document is OrbitDBCommunityChannelMessageReactionDocument =>
            this.isDocument(document) &&
            document.communityId === communityId.valueOf(),
        )
        .sort((left, right) => left.createdAt - right.createdAt)
        .slice(-limit)
        .map((document) => this.mapper.toDomain(document));
    });
  }
}
