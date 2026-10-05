import { CommunityChannelMessageRecordId } from '@app/contexts/communities/domain/CommunityChannelMessageRecordId';
import { CommunityChannelThreadSummary } from '@app/contexts/communities/domain/CommunityChannelThreadSummary';
import { CommunityChannelMessage } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessage';
import CommunityChannelMessageRepository from '@app/contexts/communities/domain/repositories/CommunityChannelMessageRepository';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '@app/contexts/communities/domain/value-objects/CommunityChannelMessageId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { PublicMutationRecord } from '@app/contexts/public-mutations/domain/PublicMutationRecord';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import PrivateCommunityPublicStorageGuard from '../PrivateCommunityPublicStorageGuard';
import { OrbitDBCommunityChannelMessageDocument } from './documents/OrbitDBCommunityChannelMessageDocument';
import OrbitDBCommunityChannelMessageMapper from './mappers/OrbitDBCommunityChannelMessageMapper';
import OrbitDBCommunityChannelMessageIndex from './OrbitDBCommunityChannelMessageIndex';
import OrbitDBCommunityChannelThreadSummaryIndex from './OrbitDBCommunityChannelThreadSummaryIndex';

export default class OrbitDBCommunityChannelMessageRepository extends CommunityChannelMessageRepository {
  private static readonly REGEX_SPECIAL_CHARACTERS = /[.*+?^${}()|[\]\\]/g;
  private readonly messageIndex: OrbitDBCommunityChannelMessageIndex;

  private readonly threadSummaryIndex: OrbitDBCommunityChannelThreadSummaryIndex;

  constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly mapper: OrbitDBCommunityChannelMessageMapper,
    private readonly publicStorageGuard: PrivateCommunityPublicStorageGuard,
  ) {
    super();
    this.messageIndex = new OrbitDBCommunityChannelMessageIndex(this.registry);
    this.threadSummaryIndex = new OrbitDBCommunityChannelThreadSummaryIndex(
      this.registry,
      this.messageIndex,
    );
  }

  private async write(
    communityId: CommunityId,
    payload: Record<string, unknown>,
    proof: PublicMutationProof,
  ): Promise<void> {
    const document = PublicMutationRecord.withProof(payload, proof);

    await this.publicStorageGuard.runWhilePublic(communityId, async () => {
      PublicMutationRecord.assertNotStale(
        await this.registry.queryDocuments(
          'messages',
          (stored) => stored.id === payload.id,
        ),
        document,
      );
      await this.registry.putDocument('messages', document);
    });
  }

  private escapeRegex(value: string): string {
    return value.replace(
      OrbitDBCommunityChannelMessageRepository.REGEX_SPECIAL_CHARACTERS,
      '\\$&',
    );
  }

  private toDomain(
    documents: OrbitDBCommunityChannelMessageDocument[],
  ): CommunityChannelMessage[] {
    return documents.map((document) => this.mapper.toDomain(document));
  }

  private byCreatedAtAscending(
    documents: OrbitDBCommunityChannelMessageDocument[],
  ): OrbitDBCommunityChannelMessageDocument[] {
    return documents.sort((left, right) => left.createdAt - right.createdAt);
  }

  private byCreatedAtDescending(
    documents: OrbitDBCommunityChannelMessageDocument[],
  ): OrbitDBCommunityChannelMessageDocument[] {
    return documents.sort((left, right) => right.createdAt - left.createdAt);
  }

  private async findMessageDocumentsByChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): Promise<OrbitDBCommunityChannelMessageDocument[]> {
    return this.messageIndex.findByChannel(communityId, channelId);
  }

  public async findById(
    communityId: CommunityId,
    channelId: CommunityChannelId,
    messageId: CommunityChannelMessageId,
  ): Promise<CommunityChannelMessage | undefined> {
    return this.publicStorageGuard.runWhilePublic(communityId, async () => {
      const document = (
        await this.findMessageDocumentsByChannel(communityId, channelId)
      ).find((candidate) =>
        new CommunityChannelMessageId(
          this.messageIndex.getMessageId(candidate),
        ).isEqual(messageId),
      );

      return document ? this.mapper.toDomain(document) : undefined;
    });
  }

  public async findByChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
    limit: number,
    beforeMessageId?: CommunityChannelMessageId,
  ): Promise<CommunityChannelMessage[]> {
    return this.publicStorageGuard.runWhilePublic(communityId, async () => {
      const documents = await this.findMessageDocumentsByChannel(
        communityId,
        channelId,
      );
      const beforeDocument = beforeMessageId
        ? documents.find((document) =>
            new CommunityChannelMessageId(
              this.messageIndex.getMessageId(document),
            ).isEqual(beforeMessageId),
          )
        : undefined;

      return this.toDomain(
        this.byCreatedAtDescending(
          documents.filter((document) =>
            beforeDocument
              ? document.createdAt < beforeDocument.createdAt
              : true,
          ),
        )
          .slice(0, limit)
          .reverse(),
      );
    });
  }

  public async findByCommunity(
    communityId: CommunityId,
    limit: number,
  ): Promise<CommunityChannelMessage[]> {
    return this.publicStorageGuard.runWhilePublic(communityId, async () => {
      const documents = await this.messageIndex.allByCommunity(communityId);

      return this.toDomain(
        this.byCreatedAtDescending(documents).slice(0, limit).reverse(),
      );
    });
  }

  public async findSyncableByCommunity(
    communityId: CommunityId,
    limit: number,
  ): Promise<CommunityChannelMessage[]> {
    return this.publicStorageGuard.runWhilePublic(communityId, async () => {
      const documents = (
        await this.messageIndex.allByCommunity(communityId)
      ).filter((document) => !document.plaintextPayload);

      return this.toDomain(
        this.byCreatedAtDescending(documents).slice(0, limit).reverse(),
      );
    });
  }

  public async findThreadMessages(
    communityId: CommunityId,
    channelId: CommunityChannelId,
    rootMessageId: CommunityChannelMessageId,
    limit: number,
  ): Promise<CommunityChannelMessage[]> {
    return this.publicStorageGuard.runWhilePublic(communityId, async () => {
      const documents = (
        await this.findMessageDocumentsByChannel(communityId, channelId)
      ).filter(
        (document) => document.replyToMessageId === rootMessageId.valueOf(),
      );

      return this.toDomain(
        this.byCreatedAtAscending(documents).slice(0, limit),
      );
    });
  }

  public async findThreadSummariesByChannel(
    communityId: CommunityId,
    channelIds: CommunityChannelId[],
    limitPerChannel: number,
  ): Promise<Map<string, CommunityChannelThreadSummary[]>> {
    return this.publicStorageGuard.runWhilePublic(communityId, async () =>
      this.threadSummaryIndex.findByChannel(
        communityId,
        channelIds,
        limitPerChannel,
      ),
    );
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
    return this.publicStorageGuard.runWhilePublic(communityId, async () => {
      const trimmedQuery = query.trim();

      if (!trimmedQuery || channelIds.length === 0) {
        return this.toDomain([]);
      }

      const regex = new RegExp(this.escapeRegex(trimmedQuery), 'i');
      const channelIdValues = new Set(
        channelIds.map((channelId) => channelId.valueOf()),
      );
      const documents = (
        await this.messageIndex.allByCommunity(communityId)
      ).filter(
        (document) =>
          channelIdValues.has(document.channelId) &&
          typeof document.plaintextPayload === 'string' &&
          regex.test(document.plaintextPayload),
      );

      return this.toDomain(
        this.byCreatedAtDescending(documents).slice(0, limit).reverse(),
      );
    });
  }

  public async save(
    message: CommunityChannelMessage,
    proof: PublicMutationProof,
  ): Promise<void> {
    const document = this.mapper.toDocument(message);
    const communityId = new CommunityId(document.communityId);

    await this.write(communityId, document, proof);

    if (document.replyToMessageId) {
      await this.threadSummaryIndex.refreshForChannel(
        communityId,
        new CommunityChannelId(document.channelId),
      );
    }
  }

  public async delete(
    communityId: CommunityId,
    channelId: CommunityChannelId,
    messageId: CommunityChannelMessageId,
    authorIdentityId: IdentityId,
    proof: PublicMutationProof,
  ): Promise<void> {
    await this.write(
      communityId,
      {
        authorIdentityId: authorIdentityId.valueOf(),
        channelId: channelId.valueOf(),
        communityId: communityId.valueOf(),
        id: CommunityChannelMessageRecordId.of(
          communityId,
          channelId,
          messageId,
          authorIdentityId,
        ),
        messageId: messageId.valueOf(),
        removed: true,
        scopeType: 'community_channel',
      },
      proof,
    );
    await this.threadSummaryIndex.refreshForChannel(communityId, channelId);
  }
}
