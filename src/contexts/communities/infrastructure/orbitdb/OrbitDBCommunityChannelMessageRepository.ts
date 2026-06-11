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

  private threadSummaryHeadKey(communityId: string, channelId: string): string {
    return `community-channel-thread-summaries:${communityId}:${channelId}`;
  }

  private isThreadSummary(
    value: unknown,
  ): value is CommunityChannelThreadSummary {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    const summary = value as Record<string, unknown>;

    return (
      typeof summary.lastReplyAt === 'number' &&
      typeof summary.lastReplyMessageId === 'string' &&
      typeof summary.replyCount === 'number' &&
      typeof summary.rootMessageId === 'string'
    );
  }

  private threadSummariesFromHead(
    document: Record<string, unknown> | undefined,
  ): CommunityChannelThreadSummary[] | undefined {
    if (!document) {
      return undefined;
    }

    const summaries = document.summaries;

    if (!Array.isArray(summaries)) {
      return [];
    }

    return summaries.filter((summary) => this.isThreadSummary(summary));
  }

  private async findThreadSummaryHead(
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): Promise<CommunityChannelThreadSummary[] | undefined> {
    return this.threadSummariesFromHead(
      await this.registry.findHead(
        this.threadSummaryHeadKey(communityId.valueOf(), channelId.valueOf()),
      ),
    );
  }

  private async putThreadSummaryHead(
    communityId: CommunityId,
    channelId: CommunityChannelId,
    summaries: CommunityChannelThreadSummary[],
  ): Promise<void> {
    await this.registry.putHead(
      this.threadSummaryHeadKey(communityId.valueOf(), channelId.valueOf()),
      {
        channelId: channelId.valueOf(),
        communityId: communityId.valueOf(),
        id: this.threadSummaryHeadKey(
          communityId.valueOf(),
          channelId.valueOf(),
        ),
        summaries,
        updatedAt: Date.now(),
      },
    );
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

    await this.refreshThreadSummaryHeadsForDocuments(documents);
  }

  private channelIdValueSet(channelIds: CommunityChannelId[]): Set<string> {
    return new Set(channelIds.map((channelId) => channelId.valueOf()));
  }

  private async findThreadCandidateDocuments(
    communityId: CommunityId,
    channelIdValues: Set<string>,
  ): Promise<OrbitDBCommunityChannelMessageDocument[]> {
    return this.findDocuments(
      (document) =>
        new CommunityId(document.communityId).isEqual(communityId) &&
        channelIdValues.has(document.channelId),
    );
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

  private findExistingRootIds(
    documents: OrbitDBCommunityChannelMessageDocument[],
    rootIds: Set<string>,
  ): Set<string> {
    return new Set(
      documents
        .filter((document) => rootIds.has(this.getMessageId(document)))
        .map((document) => this.getMessageId(document)),
    );
  }

  private findRecentThreadReplyDocuments(
    documents: OrbitDBCommunityChannelMessageDocument[],
    candidateLimit: number,
  ): OrbitDBCommunityChannelMessageDocument[] {
    return this.byCreatedAtDescending(
      documents.filter(
        (document) => typeof document.replyToMessageId === 'string',
      ),
    ).slice(0, candidateLimit);
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

      summaries.push(summary);
      summaries.sort((left, right) => right.lastReplyAt - left.lastReplyAt);
      summariesByChannelId.set(channelId, summaries.slice(0, limitPerChannel));
    }

    return summariesByChannelId;
  }

  private threadSummariesFromDocuments(
    documents: OrbitDBCommunityChannelMessageDocument[],
    limitPerChannel: number,
  ): Map<string, CommunityChannelThreadSummary[]> {
    const replyDocuments = this.findRecentThreadReplyDocuments(
      documents,
      documents.length,
    );
    const existingRootIds = this.findExistingRootIds(
      documents,
      this.rootIdsFrom(replyDocuments),
    );

    return this.limitSummariesByChannel(
      this.groupThreadSummaries(replyDocuments, existingRootIds),
      limitPerChannel,
    );
  }

  private async hydrateThreadSummaryHeads(
    communityId: CommunityId,
    channelIds: CommunityChannelId[],
  ): Promise<Map<string, CommunityChannelThreadSummary[]>> {
    const channelIdValues = this.channelIdValueSet(channelIds);
    const documents = await this.findThreadCandidateDocuments(
      communityId,
      channelIdValues,
    );
    const summariesByChannelId = this.threadSummariesFromDocuments(
      documents,
      Number.MAX_SAFE_INTEGER,
    );

    await Promise.all(
      channelIds.map((channelId) =>
        this.putThreadSummaryHead(
          communityId,
          channelId,
          summariesByChannelId.get(channelId.valueOf()) || [],
        ),
      ),
    );

    return summariesByChannelId;
  }

  private async refreshThreadSummaryHead(
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): Promise<void> {
    await this.hydrateThreadSummaryHeads(communityId, [channelId]);
  }

  private async refreshThreadSummaryHeadsForDocuments(
    documents: OrbitDBCommunityChannelMessageDocument[],
  ): Promise<void> {
    const affectedChannels = new Map<string, CommunityChannelId>();

    for (const document of documents) {
      affectedChannels.set(
        `${document.communityId}:${document.channelId}`,
        new CommunityChannelId(document.channelId),
      );
    }

    await Promise.all(
      [...affectedChannels.entries()].map(([key, channelId]) => {
        const [communityId] = key.split(':');

        return this.refreshThreadSummaryHead(
          new CommunityId(communityId),
          channelId,
        );
      }),
    );
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

    const summariesByChannelId = new Map<
      string,
      CommunityChannelThreadSummary[]
    >();
    const missingChannelIds: CommunityChannelId[] = [];

    for (const channelId of channelIds) {
      const summaries = await this.findThreadSummaryHead(
        communityId,
        channelId,
      );

      if (summaries === undefined) {
        missingChannelIds.push(channelId);

        continue;
      }

      summariesByChannelId.set(
        channelId.valueOf(),
        [...summaries]
          .sort((left, right) => right.lastReplyAt - left.lastReplyAt)
          .slice(0, limitPerChannel),
      );
    }

    const hydratedSummariesByChannelId =
      missingChannelIds.length > 0
        ? await this.hydrateThreadSummaryHeads(communityId, missingChannelIds)
        : new Map<string, CommunityChannelThreadSummary[]>();

    for (const [channelId, summaries] of hydratedSummariesByChannelId) {
      summariesByChannelId.set(
        channelId,
        [...summaries]
          .sort((left, right) => right.lastReplyAt - left.lastReplyAt)
          .slice(0, limitPerChannel),
      );
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
    const document = this.mapper.toDocument(message);

    await this.registry.putDocument('messages', document);

    if (document.replyToMessageId) {
      await this.refreshThreadSummaryHead(
        new CommunityId(document.communityId),
        new CommunityChannelId(document.channelId),
      );
    }
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
