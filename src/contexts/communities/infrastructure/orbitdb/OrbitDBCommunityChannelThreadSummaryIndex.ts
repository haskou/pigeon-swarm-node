import { CommunityChannelThreadSummary } from '@app/contexts/communities/domain/CommunityChannelThreadSummary';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '@app/contexts/communities/domain/value-objects/CommunityChannelMessageId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { Timestamp } from '@haskou/value-objects';

import { OrbitDBCommunityChannelMessageDocument } from './documents/OrbitDBCommunityChannelMessageDocument';
import { OrbitDBCommunityChannelThreadSummaryDocument } from './documents/OrbitDBCommunityChannelThreadSummaryDocument';
import OrbitDBCommunityChannelMessageIndex from './OrbitDBCommunityChannelMessageIndex';

export default class OrbitDBCommunityChannelThreadSummaryIndex {
  constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly messageIndex: OrbitDBCommunityChannelMessageIndex,
  ) {}

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

  private isThreadSummaryRecord(
    value: unknown,
  ): value is OrbitDBCommunityChannelThreadSummaryDocument {
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

  private summariesFromHead(
    document: Record<string, unknown> | undefined,
  ): CommunityChannelThreadSummary[] | undefined {
    if (!document) {
      return undefined;
    }

    const summaries = document.summaries;

    if (!Array.isArray(summaries)) {
      return [];
    }

    return summaries
      .filter((summary) => this.isThreadSummaryRecord(summary))
      .map((summary) => CommunityChannelThreadSummary.fromPrimitives(summary));
  }

  private async findHead(
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): Promise<CommunityChannelThreadSummary[] | undefined> {
    return this.summariesFromHead(
      await this.registry.findHead(
        this.threadSummaryHeadKey(communityId.valueOf(), channelId.valueOf()),
      ),
    );
  }

  private async putHead(
    communityId: CommunityId,
    channelId: CommunityChannelId,
    summaries: CommunityChannelThreadSummary[],
  ): Promise<void> {
    await this.registry.putHead(
      this.threadSummaryHeadKey(communityId.valueOf(), channelId.valueOf()),
      this.headDocument(communityId, channelId, summaries),
    );
  }

  private headDocument(
    communityId: CommunityId,
    channelId: CommunityChannelId,
    summaries: CommunityChannelThreadSummary[],
  ): Record<string, unknown> {
    return {
      channelId: channelId.valueOf(),
      communityId: communityId.valueOf(),
      id: this.threadSummaryHeadKey(communityId.valueOf(), channelId.valueOf()),
      summaries: summaries.map((summary) => summary.toPrimitives()),
      updatedAt: Date.now(),
    };
  }

  private replicateHeadInBackground(
    communityId: CommunityId,
    channelId: CommunityChannelId,
    summaries: CommunityChannelThreadSummary[],
  ): void {
    this.registry.replicateHeadInBackground(
      this.threadSummaryHeadKey(communityId.valueOf(), channelId.valueOf()),
      this.headDocument(communityId, channelId, summaries),
    );
  }

  private channelIdValueSet(channelIds: CommunityChannelId[]): Set<string> {
    return new Set(channelIds.map((channelId) => channelId.valueOf()));
  }

  private async findThreadCandidateDocuments(
    communityId: CommunityId,
    channelIdValues: Set<string>,
  ): Promise<OrbitDBCommunityChannelMessageDocument[]> {
    return (await this.messageIndex.allByCommunity(communityId)).filter(
      (document) => channelIdValues.has(document.channelId),
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
        .filter((document) =>
          rootIds.has(this.messageIndex.getMessageId(document)),
        )
        .map((document) => this.messageIndex.getMessageId(document)),
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

    const replyMessageId = new CommunityChannelMessageId(
      this.messageIndex.getMessageId(document),
    );
    const repliedAt = new Timestamp(document.createdAt);

    grouped.set(
      key,
      current
        ? current.withReply(replyMessageId, repliedAt)
        : new CommunityChannelThreadSummary(
            new CommunityChannelMessageId(rootMessageId),
            replyMessageId,
            1,
            repliedAt,
          ),
    );
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
      summaries.sort(
        (left, right) =>
          right.getLastReplyAt().valueOf() - left.getLastReplyAt().valueOf(),
      );
      summariesByChannelId.set(channelId, summaries.slice(0, limitPerChannel));
    }

    return summariesByChannelId;
  }

  private summariesFromDocuments(
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

  private async hydrateHeads(
    communityId: CommunityId,
    channelIds: CommunityChannelId[],
  ): Promise<Map<string, CommunityChannelThreadSummary[]>> {
    const channelIdValues = this.channelIdValueSet(channelIds);
    const documents = await this.findThreadCandidateDocuments(
      communityId,
      channelIdValues,
    );
    const summariesByChannelId = this.summariesFromDocuments(
      documents,
      Number.MAX_SAFE_INTEGER,
    );

    await Promise.all(
      channelIds.map((channelId) =>
        this.putHead(
          communityId,
          channelId,
          summariesByChannelId.get(channelId.valueOf()) || [],
        ),
      ),
    );

    return summariesByChannelId;
  }

  public async refreshForChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): Promise<void> {
    await this.hydrateHeads(communityId, [channelId]);
  }

  public refreshForChannelInBackground(
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): void {
    void this.findThreadCandidateDocuments(
      communityId,
      new Set([channelId.valueOf()]),
    ).then((documents) => {
      const summariesByChannelId = this.summariesFromDocuments(
        documents,
        Number.MAX_SAFE_INTEGER,
      );

      this.replicateHeadInBackground(
        communityId,
        channelId,
        summariesByChannelId.get(channelId.valueOf()) || [],
      );
    });
  }

  public async refreshForDocuments(
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

        return this.refreshForChannel(new CommunityId(communityId), channelId);
      }),
    );
  }

  public refreshForDocumentsInBackground(
    documents: OrbitDBCommunityChannelMessageDocument[],
  ): void {
    const affectedChannels = new Map<string, CommunityChannelId>();

    for (const document of documents) {
      affectedChannels.set(
        `${document.communityId}:${document.channelId}`,
        new CommunityChannelId(document.channelId),
      );
    }

    for (const [key, channelId] of affectedChannels.entries()) {
      const [communityId] = key.split(':');

      this.refreshForChannelInBackground(
        new CommunityId(communityId),
        channelId,
      );
    }
  }

  public async findByChannel(
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
      const summaries = await this.findHead(communityId, channelId);

      if (summaries === undefined) {
        missingChannelIds.push(channelId);

        continue;
      }

      summariesByChannelId.set(
        channelId.valueOf(),
        [...summaries]
          .sort(
            (left, right) =>
              right.getLastReplyAt().valueOf() -
              left.getLastReplyAt().valueOf(),
          )
          .slice(0, limitPerChannel),
      );
    }

    if (missingChannelIds.length > 0) {
      const calculatedSummaries = this.summariesFromDocuments(
        await this.findThreadCandidateDocuments(
          communityId,
          this.channelIdValueSet(missingChannelIds),
        ),
        Number.MAX_SAFE_INTEGER,
      );

      for (const channelId of missingChannelIds) {
        summariesByChannelId.set(
          channelId.valueOf(),
          (calculatedSummaries.get(channelId.valueOf()) || []).slice(
            0,
            limitPerChannel,
          ),
        );
      }
    }

    return summariesByChannelId;
  }
}
