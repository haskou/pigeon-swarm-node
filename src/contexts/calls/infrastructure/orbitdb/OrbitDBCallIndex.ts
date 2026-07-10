import { CallId } from '@app/contexts/calls/domain/value-objects/CallId';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { OrbitDBHeadIndex } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBHeadIndex';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import Kernel from '@haskou/ddd-kernel';
import { Timestamp } from '@haskou/value-objects';

import { OrbitDBCallDocument } from './documents/OrbitDBCallDocument';

export default class OrbitDBCallIndex {
  private readonly index: OrbitDBHeadIndex<OrbitDBCallDocument>;

  private readonly communityChannelCallCache = new Map<
    string,
    OrbitDBCallDocument
  >();

  private readonly eventCallCache = new Map<string, OrbitDBCallDocument>();

  constructor(private readonly registry: OrbitDBReplicatedStateRegistry) {
    this.index = new OrbitDBHeadIndex(this.registry, {
      collectionName: 'calls',
      documentFromRecord: (record) =>
        this.isDocument(record) ? record : undefined,
      recordId: (record) =>
        typeof record.id === 'string' ? record.id : undefined,
      shouldReplace: (current, candidate) =>
        this.freshness(current) <= this.freshness(candidate),
    });
  }

  private hasCallIdentityFields(document: Record<string, unknown>): boolean {
    return (
      typeof document.id === 'string' &&
      typeof document.createdAt === 'number' &&
      typeof document.creatorIdentityId === 'string' &&
      typeof document.networkId === 'string'
    );
  }

  private hasCallStateFields(document: Record<string, unknown>): boolean {
    return (
      Array.isArray(document.participantIds) &&
      Array.isArray(document.participants) &&
      typeof document.scope === 'object' &&
      document.scope !== null &&
      typeof document.status === 'string'
    );
  }

  private isDocument(
    document: Record<string, unknown>,
  ): document is OrbitDBCallDocument {
    return (
      this.hasCallIdentityFields(document) && this.hasCallStateFields(document)
    );
  }

  private freshness(document: OrbitDBCallDocument): number {
    return Math.max(
      document.updatedAt ?? 0,
      document.endedAt ?? 0,
      document.createdAt,
    );
  }

  private callHeadKey(callId: string): string {
    return `call:${callId}`;
  }

  private activeIndexHeadKey(): string {
    return 'call-active-index';
  }

  private participantIndexHeadKey(participantId: string): string {
    return `call-participant-index:${participantId}`;
  }

  private conversationIndexHeadKey(conversationId: string): string {
    return `call-conversation-index:${conversationId}`;
  }

  private communityChannelIndexHeadKey(
    communityId: string,
    channelId: string,
  ): string {
    return `call-community-channel-index:${communityId}:${channelId}`;
  }

  private communityActiveIndexHeadKey(communityId: string): string {
    return `call-community-active-index:${communityId}`;
  }

  private communityChannelHeadKey(
    communityId: string,
    channelId: string,
  ): string {
    return `call-community-channel-head:${communityId}:${channelId}`;
  }

  private communityChannelCacheKey(
    communityId: string,
    channelId: string,
  ): string {
    return `${communityId}:${channelId}`;
  }

  private async findIndexDocuments(
    key: string,
  ): Promise<OrbitDBCallDocument[] | undefined> {
    return this.index.find(key);
  }

  private cachedCallDocuments(): OrbitDBCallDocument[] {
    return this.index.deduplicate([
      ...this.eventCallCache.values(),
      ...this.registry
        .findCachedHeadsByPrefix('call:')
        .filter((document): document is OrbitDBCallDocument =>
          this.isDocument(document),
        ),
    ]);
  }

  private async callDocumentsFromIndexAndCache(
    key: string,
    filter: (document: OrbitDBCallDocument) => boolean,
  ): Promise<OrbitDBCallDocument[]> {
    return this.index.deduplicate([
      ...((await this.findIndexDocuments(key)) ?? []),
      ...this.cachedCallDocuments().filter(filter),
    ]);
  }

  private async freshPrimaryDocuments(
    documents: OrbitDBCallDocument[],
  ): Promise<OrbitDBCallDocument[]> {
    return Promise.all(
      documents.map(async (document) => {
        const head = await this.registry.findHead(
          this.callHeadKey(document.id),
        );

        if (!head || !this.isDocument(head)) {
          return document;
        }

        return this.freshness(head) >= this.freshness(document)
          ? head
          : document;
      }),
    );
  }

  private hasStaleActiveDocuments(
    indexedDocuments: OrbitDBCallDocument[],
    freshDocuments: OrbitDBCallDocument[],
  ): boolean {
    const freshDocumentsById = new Map(
      freshDocuments.map((document) => [document.id, document]),
    );

    return indexedDocuments.some((document) => {
      const freshDocument = freshDocumentsById.get(document.id);

      return (
        document.status === 'active' &&
        freshDocument !== undefined &&
        (!this.isActive(freshDocument) ||
          this.freshness(document) < this.freshness(freshDocument))
      );
    });
  }

  private repairActiveIndexInBackground(
    documents: OrbitDBCallDocument[],
  ): void {
    void this.putIndex(this.activeIndexHeadKey(), documents, (call) =>
      this.isActive(call),
    ).catch((error) => {
      Kernel.logger.warn?.(
        `Call active index repair failed: error=${String(error)}`,
      );
    });
  }

  private async activeDocumentsForTimeoutChecks(): Promise<
    OrbitDBCallDocument[]
  > {
    const indexedDocuments = await this.callDocumentsFromIndexAndCache(
      this.activeIndexHeadKey(),
      (document) => document.status === 'active',
    );
    const freshDocuments = await this.freshPrimaryDocuments(indexedDocuments);

    if (this.hasStaleActiveDocuments(indexedDocuments, freshDocuments)) {
      this.repairActiveIndexInBackground(freshDocuments);
    }

    return freshDocuments.filter((document) => document.status === 'active');
  }

  private cachedCommunityChannelCallDocument(
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): OrbitDBCallDocument[] {
    const document = this.communityChannelCallCache.get(
      this.communityChannelCacheKey(communityId.valueOf(), channelId.valueOf()),
    );

    return document ? [document] : [];
  }

  private async activeCommunityDocuments(
    communityId: CommunityId,
  ): Promise<OrbitDBCallDocument[]> {
    return this.freshPrimaryDocuments(
      (await this.findIndexDocuments(
        this.communityActiveIndexHeadKey(communityId.valueOf()),
      )) ?? [],
    );
  }

  private async cachedCommunityChannelHeadDocument(
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): Promise<OrbitDBCallDocument[]> {
    const document = await this.registry.findHead(
      this.communityChannelHeadKey(communityId.valueOf(), channelId.valueOf()),
    );

    return document && this.isDocument(document) ? [document] : [];
  }

  private async putIndex(
    key: string,
    documents: OrbitDBCallDocument[],
    filter: (document: OrbitDBCallDocument) => boolean = () => true,
  ): Promise<void> {
    await this.index.putDocuments(
      key,
      {
        id: key,
      },
      documents,
      {
        filter,
        networkIds: [...new Set(documents.map((call) => call.networkId))],
      },
    );
  }

  private async putIndexDocument(
    key: string,
    document: OrbitDBCallDocument,
    filter: (candidate: OrbitDBCallDocument) => boolean = () => true,
  ): Promise<void> {
    await this.putIndex(
      key,
      [...((await this.findIndexDocuments(key)) || []), document],
      filter,
    );
  }

  private isActive(document: OrbitDBCallDocument): boolean {
    return document.status === 'active';
  }

  private replicateCallHeadInBackground(document: OrbitDBCallDocument): void {
    this.registry.replicateHeadInBackground(
      this.callHeadKey(document.id),
      { ...document },
      [document.networkId],
    );
  }

  private async putIndexes(document: OrbitDBCallDocument): Promise<void> {
    await this.putIndexDocument(this.activeIndexHeadKey(), document, (call) =>
      this.isActive(call),
    );

    await Promise.all(
      document.participantIds.map((participantId) =>
        this.putIndexDocument(
          this.participantIndexHeadKey(participantId),
          document,
        ),
      ),
    );

    if (
      document.scope.type === 'conversation' &&
      document.scope.conversationId
    ) {
      await this.putIndexDocument(
        this.conversationIndexHeadKey(document.scope.conversationId),
        document,
      );
    }

    if (
      document.scope.type === 'community_channel' &&
      document.scope.communityId &&
      document.scope.channelId
    ) {
      await this.putIndexDocument(
        this.communityChannelIndexHeadKey(
          document.scope.communityId,
          document.scope.channelId,
        ),
        document,
      );
      await this.putIndexDocument(
        this.communityActiveIndexHeadKey(document.scope.communityId),
        document,
        (call) => this.isActive(call),
      );
    }
  }

  private refreshIndexesInBackground(document: OrbitDBCallDocument): void {
    void this.putIndexes(document).catch((error) => {
      Kernel.logger.warn?.(
        `Call indexes refresh failed: callId=${document.id} error=${String(error)}`,
      );
    });
  }

  private cacheCommunityChannelCall(document: OrbitDBCallDocument): void {
    if (
      document.scope.type !== 'community_channel' ||
      !document.scope.communityId ||
      !document.scope.channelId
    ) {
      return;
    }

    this.communityChannelCallCache.set(
      this.communityChannelCacheKey(
        document.scope.communityId,
        document.scope.channelId,
      ),
      document,
    );
  }

  public async findById(id: CallId): Promise<OrbitDBCallDocument | undefined> {
    const head = await this.registry.findHead(this.callHeadKey(id.valueOf()));
    const eventReplica = this.eventCallCache.get(id.valueOf());

    if (
      head &&
      this.isDocument(head) &&
      (!eventReplica || this.freshness(head) >= this.freshness(eventReplica))
    ) {
      return head;
    }

    return eventReplica;
  }

  public registerReplica(document: OrbitDBCallDocument): void {
    const current = this.eventCallCache.get(document.id);

    if (!current || this.freshness(current) <= this.freshness(document)) {
      this.eventCallCache.set(document.id, document);
      this.cacheCommunityChannelCall(document);
    }
  }

  public async findActiveByParticipant(
    participantId: IdentityId,
  ): Promise<OrbitDBCallDocument[]> {
    const indexedDocuments = await this.findIndexDocuments(
      this.participantIndexHeadKey(participantId.valueOf()),
    );

    return this.index
      .deduplicate([
        ...(indexedDocuments ?? []),
        ...this.cachedCallDocuments().filter((document) =>
          document.participantIds.includes(participantId.valueOf()),
        ),
      ])
      .filter(
        (document) =>
          document.status === 'active' &&
          document.participants.some(
            (participant) =>
              participant.identityId === participantId.valueOf() &&
              ['joined', 'ringing'].includes(participant.status),
          ),
      );
  }

  public async findByParticipant(
    participantId: IdentityId,
  ): Promise<OrbitDBCallDocument[]> {
    return this.callDocumentsFromIndexAndCache(
      this.participantIndexHeadKey(participantId.valueOf()),
      (document) => document.participantIds.includes(participantId.valueOf()),
    );
  }

  public async findByConversationId(
    conversationId: ConversationId,
  ): Promise<OrbitDBCallDocument[]> {
    return (
      await this.callDocumentsFromIndexAndCache(
        this.conversationIndexHeadKey(conversationId.valueOf()),
        (document) =>
          document.scope.type === 'conversation' &&
          document.scope.conversationId === conversationId.valueOf(),
      )
    ).sort((left, right) => left.createdAt - right.createdAt);
  }

  public async findByCommunityChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): Promise<OrbitDBCallDocument[]> {
    return (
      await this.callDocumentsFromIndexAndCache(
        this.communityChannelIndexHeadKey(
          communityId.valueOf(),
          channelId.valueOf(),
        ),
        (document) =>
          document.scope.type === 'community_channel' &&
          document.scope.communityId === communityId.valueOf() &&
          document.scope.channelId === channelId.valueOf(),
      )
    ).sort((left, right) => left.createdAt - right.createdAt);
  }

  public async findActiveByCommunityChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): Promise<OrbitDBCallDocument | undefined> {
    const indexedDocuments = await this.freshPrimaryDocuments(
      (await this.findIndexDocuments(
        this.communityChannelIndexHeadKey(
          communityId.valueOf(),
          channelId.valueOf(),
        ),
      )) ?? [],
    );
    const [document] = this.index
      .deduplicate([
        ...indexedDocuments,
        ...(await this.activeCommunityDocuments(communityId)),
        ...(await this.cachedCommunityChannelHeadDocument(
          communityId,
          channelId,
        )),
        ...this.cachedCommunityChannelCallDocument(communityId, channelId),
      ])
      .filter(
        (candidate) =>
          candidate.status === 'active' &&
          candidate.scope.type === 'community_channel' &&
          candidate.scope.communityId === communityId.valueOf() &&
          candidate.scope.channelId === channelId.valueOf(),
      );

    return document;
  }

  public async findActiveByCommunity(
    communityId: CommunityId,
  ): Promise<OrbitDBCallDocument[]> {
    return (
      await this.callDocumentsFromIndexAndCache(
        this.communityActiveIndexHeadKey(communityId.valueOf()),
        (document) =>
          document.scope.type === 'community_channel' &&
          document.scope.communityId === communityId.valueOf(),
      )
    )
      .filter((document) => document.status === 'active')
      .sort((left, right) => left.createdAt - right.createdAt);
  }

  public async findTimedOutRingingCalls(
    timeoutThreshold: Timestamp,
  ): Promise<OrbitDBCallDocument[]> {
    return (await this.activeDocumentsForTimeoutChecks()).filter(
      (document) =>
        document.createdAt <= timeoutThreshold.valueOf() &&
        document.participants.some(
          (participant) => participant.status === 'ringing',
        ),
    );
  }

  public put(document: OrbitDBCallDocument): void {
    this.replicateCallHeadInBackground(document);
    this.cacheCommunityChannelCall(document);
    this.refreshIndexesInBackground(document);
  }
}
