import { CommunityChannelMessage } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessage';
import CommunityChannelMessageRepository from '@app/contexts/communities/domain/repositories/CommunityChannelMessageRepository';
import { CommunityChannelThreadSummary } from '@app/contexts/communities/domain/types/CommunityChannelThreadSummary';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '@app/contexts/communities/domain/value-objects/CommunityChannelMessageId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { OrbitDBCommunityChannelMessageDocument } from './documents/OrbitDBCommunityChannelMessageDocument';
import OrbitDBCommunityChannelMessageMapper from './mappers/OrbitDBCommunityChannelMessageMapper';

// eslint-disable-next-line max-len
export default class OrbitDBCommunityChannelMessageRepository extends CommunityChannelMessageRepository {
  private static readonly REGEX_SPECIAL_CHARACTERS = /[.*+?^${}()|[\]\\]/g;
  private static readonly THREAD_LIMIT_MULTIPLIER = 25;

  constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly mapper: OrbitDBCommunityChannelMessageMapper,
  ) {
    super();
  }

  private escapeRegex(value: string): string {
    return value.replace(
      OrbitDBCommunityChannelMessageRepository.REGEX_SPECIAL_CHARACTERS,
      '\\$&',
    );
  }

  private getMessageId(
    document: OrbitDBCommunityChannelMessageDocument,
  ): string {
    return document.messageId || document.id;
  }

  private hasStringFields(
    value: Record<string, unknown>,
    fields: string[],
  ): boolean {
    return fields.every((field) => typeof value[field] === 'string');
  }

  private isStringArray(value: unknown): value is string[] {
    return (
      Array.isArray(value) && value.every((item) => typeof item === 'string')
    );
  }

  private isDocument(
    value: Record<string, unknown>,
  ): value is OrbitDBCommunityChannelMessageDocument {
    return (
      value.deleted !== true &&
      value.scopeType === 'community_channel' &&
      this.hasStringFields(value, [
        'authorIdentityId',
        'channelId',
        'communityId',
        'id',
        'type',
      ]) &&
      typeof value.createdAt === 'number' &&
      this.isStringArray(value.attachmentExternalIdentifiers)
    );
  }

  private async findDocuments(
    matcher: (document: OrbitDBCommunityChannelMessageDocument) => boolean,
  ): Promise<OrbitDBCommunityChannelMessageDocument[]> {
    const documents = await this.registry.queryDocuments(
      'messages',
      (document) => this.isDocument(document) && matcher(document),
    );

    return documents.filter(
      (document): document is OrbitDBCommunityChannelMessageDocument =>
        this.isDocument(document),
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

  private threadSummaryCandidateLimit(
    channelIds: CommunityChannelId[],
    limitPerChannel: number,
  ): number {
    const multiplier =
      OrbitDBCommunityChannelMessageRepository.THREAD_LIMIT_MULTIPLIER;

    return channelIds.length * limitPerChannel * multiplier;
  }

  private async tombstone(
    matcher: (document: OrbitDBCommunityChannelMessageDocument) => boolean,
  ): Promise<void> {
    const documents = await this.findDocuments(matcher);

    await Promise.all(
      documents.map((document) =>
        this.registry.putDocument('messages', {
          ...document,
          deleted: true,
          deletedAt: Date.now(),
        }),
      ),
    );
  }

  private channelIdValueSet(channelIds: CommunityChannelId[]): Set<string> {
    return new Set(channelIds.map((channelId) => channelId.valueOf()));
  }

  private async findThreadReplyDocuments(
    communityId: CommunityId,
    channelIdValues: Set<string>,
    candidateLimit: number,
  ): Promise<OrbitDBCommunityChannelMessageDocument[]> {
    const documents = await this.findDocuments(
      (document) =>
        new CommunityId(document.communityId).isEqual(communityId) &&
        channelIdValues.has(document.channelId) &&
        typeof document.replyToMessageId === 'string',
    );

    return this.byCreatedAtDescending(documents).slice(0, candidateLimit);
  }

  private rootIdsFrom(
    documents: OrbitDBCommunityChannelMessageDocument[],
  ): Set<string> {
    return new Set(
      documents
        .map((document) => document.replyToMessageId)
        .filter((id): id is string => typeof id === 'string'),
    );
  }

  private async findExistingRootIds(
    communityId: CommunityId,
    channelIdValues: Set<string>,
    rootIds: Set<string>,
  ): Promise<Set<string>> {
    const rootMessages = await this.findDocuments(
      (document) =>
        new CommunityId(document.communityId).isEqual(communityId) &&
        channelIdValues.has(document.channelId) &&
        rootIds.has(this.getMessageId(document)),
    );

    return new Set(rootMessages.map((document) => this.getMessageId(document)));
  }

  private registerThreadReplySummary(
    grouped: Map<string, CommunityChannelThreadSummary>,
    document: OrbitDBCommunityChannelMessageDocument,
    rootMessageId: string,
  ): void {
    const key = `${document.channelId}:${rootMessageId}`;
    const current = grouped.get(key);

    grouped.set(key, {
      lastReplyAt: Math.max(current?.lastReplyAt || 0, document.createdAt),
      lastReplyMessageId:
        !current || current.lastReplyAt <= document.createdAt
          ? this.getMessageId(document)
          : current.lastReplyMessageId,
      replyCount: (current?.replyCount || 0) + 1,
      rootMessageId,
    });
  }

  private groupThreadSummaries(
    documents: OrbitDBCommunityChannelMessageDocument[],
    existingRootIds: Set<string>,
  ): Map<string, CommunityChannelThreadSummary> {
    const grouped = new Map<string, CommunityChannelThreadSummary>();

    for (const document of this.byCreatedAtAscending(documents)) {
      const rootMessageId = document.replyToMessageId;

      if (rootMessageId && existingRootIds.has(rootMessageId)) {
        this.registerThreadReplySummary(grouped, document, rootMessageId);
      }
    }

    return grouped;
  }

  private limitSummariesByChannel(
    grouped: Map<string, CommunityChannelThreadSummary>,
    limitPerChannel: number,
  ): Map<string, CommunityChannelThreadSummary[]> {
    const summariesByChannelId = new Map<
      string,
      CommunityChannelThreadSummary[]
    >();

    for (const [key, summary] of grouped.entries()) {
      const [channelId] = key.split(':');
      const summaries = summariesByChannelId.get(channelId) || [];

      if (summaries.length < limitPerChannel) {
        summaries.push(summary);
        summaries.sort((left, right) => right.lastReplyAt - left.lastReplyAt);
        summariesByChannelId.set(channelId, summaries);
      }
    }

    return summariesByChannelId;
  }

  public async findById(
    communityId: CommunityId,
    channelId: CommunityChannelId,
    messageId: CommunityChannelMessageId,
  ): Promise<CommunityChannelMessage | undefined> {
    const [document] = await this.findDocuments(
      (candidate) =>
        new CommunityId(candidate.communityId).isEqual(communityId) &&
        new CommunityChannelId(candidate.channelId).isEqual(channelId) &&
        new CommunityChannelMessageId(this.getMessageId(candidate)).isEqual(
          messageId,
        ),
    );

    return document ? this.mapper.toDomain(document) : undefined;
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
    const documents = await this.findDocuments(
      (document) =>
        new CommunityId(document.communityId).isEqual(communityId) &&
        new CommunityChannelId(document.channelId).isEqual(channelId) &&
        (beforeCreatedAt ? document.createdAt < beforeCreatedAt : true),
    );

    return this.toDomain(
      this.byCreatedAtDescending(documents).slice(0, limit).reverse(),
    );
  }

  public async findByCommunity(
    communityId: CommunityId,
    limit: number,
  ): Promise<CommunityChannelMessage[]> {
    const documents = await this.findDocuments((document) =>
      new CommunityId(document.communityId).isEqual(communityId),
    );

    return this.toDomain(
      this.byCreatedAtDescending(documents).slice(0, limit).reverse(),
    );
  }

  public async findSyncableByCommunity(
    communityId: CommunityId,
    limit: number,
  ): Promise<CommunityChannelMessage[]> {
    const documents = await this.findDocuments(
      (document) =>
        new CommunityId(document.communityId).isEqual(communityId) &&
        !document.plaintextPayload,
    );

    return this.toDomain(
      this.byCreatedAtDescending(documents).slice(0, limit).reverse(),
    );
  }

  public async findThreadMessages(
    communityId: CommunityId,
    channelId: CommunityChannelId,
    rootMessageId: CommunityChannelMessageId,
    limit: number,
  ): Promise<CommunityChannelMessage[]> {
    const documents = await this.findDocuments(
      (document) =>
        new CommunityId(document.communityId).isEqual(communityId) &&
        new CommunityChannelId(document.channelId).isEqual(channelId) &&
        document.replyToMessageId === rootMessageId.valueOf(),
    );

    return this.toDomain(this.byCreatedAtAscending(documents).slice(0, limit));
  }

  public async findThreadSummariesByChannel(
    communityId: CommunityId,
    channelIds: CommunityChannelId[],
    limitPerChannel: number,
  ): Promise<Map<string, CommunityChannelThreadSummary[]>> {
    if (channelIds.length === 0) {
      return new Map();
    }

    const channelIdValues = this.channelIdValueSet(channelIds);
    const documents = await this.findThreadReplyDocuments(
      communityId,
      channelIdValues,
      this.threadSummaryCandidateLimit(channelIds, limitPerChannel),
    );
    const existingRootIds = await this.findExistingRootIds(
      communityId,
      channelIdValues,
      this.rootIdsFrom(documents),
    );

    return this.limitSummariesByChannel(
      this.groupThreadSummaries(documents, existingRootIds),
      limitPerChannel,
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
    const trimmedQuery = query.trim();

    if (!trimmedQuery || channelIds.length === 0) {
      return [];
    }

    const regex = new RegExp(this.escapeRegex(trimmedQuery), 'i');
    const channelIdValues = new Set(
      channelIds.map((channelId) => channelId.valueOf()),
    );
    const documents = await this.findDocuments(
      (document) =>
        new CommunityId(document.communityId).isEqual(communityId) &&
        channelIdValues.has(document.channelId) &&
        typeof document.plaintextPayload === 'string' &&
        regex.test(document.plaintextPayload),
    );

    return this.toDomain(
      this.byCreatedAtDescending(documents).slice(0, limit).reverse(),
    );
  }

  public async save(message: CommunityChannelMessage): Promise<void> {
    await this.registry.putDocument(
      'messages',
      this.mapper.toDocument(message),
    );
  }

  public async delete(
    communityId: CommunityId,
    channelId: CommunityChannelId,
    messageId: CommunityChannelMessageId,
  ): Promise<void> {
    await this.tombstone(
      (document) =>
        new CommunityId(document.communityId).isEqual(communityId) &&
        new CommunityChannelId(document.channelId).isEqual(channelId) &&
        new CommunityChannelMessageId(this.getMessageId(document)).isEqual(
          messageId,
        ),
    );
  }

  public async deleteByChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): Promise<void> {
    await this.tombstone(
      (document) =>
        new CommunityId(document.communityId).isEqual(communityId) &&
        new CommunityChannelId(document.channelId).isEqual(channelId),
    );
  }

  public async deleteByCommunity(communityId: CommunityId): Promise<void> {
    await this.tombstone((document) =>
      new CommunityId(document.communityId).isEqual(communityId),
    );
  }
}
