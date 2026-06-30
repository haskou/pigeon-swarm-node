import { Call } from '@app/contexts/calls/domain/Call';
import CallRepository from '@app/contexts/calls/domain/repositories/CallRepository';
import { CallId } from '@app/contexts/calls/domain/value-objects/CallId';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBHeadIndex from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBHeadIndex';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import Kernel from '@haskou/ddd-kernel';
import { Timestamp } from '@haskou/value-objects';

import { OrbitDBCallDocument } from './documents/OrbitDBCallDocument';

export default class OrbitDBCallRepository extends CallRepository {
  private readonly callIndex: OrbitDBHeadIndex<OrbitDBCallDocument>;

  private readonly communityChannelCallCache = new Map<
    string,
    OrbitDBCallDocument
  >();

  constructor(private readonly registry: OrbitDBReplicatedStateRegistry) {
    super();
    this.callIndex = new OrbitDBHeadIndex(this.registry, {
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

  private toDocument(call: Call): OrbitDBCallDocument {
    const primitives = call.toPrimitives();

    return {
      createdAt: primitives.createdAt,
      creatorIdentityId: primitives.creatorIdentityId,
      endedAt: primitives.endedAt,
      endedByIdentityId: primitives.endedByIdentityId,
      id: primitives.id,
      networkId: primitives.networkId,
      participantIds: primitives.participantIds,
      participants: primitives.participants,
      scope: primitives.scope,
      status: primitives.status,
      updatedAt: Date.now(),
    };
  }

  private toDomain(document: OrbitDBCallDocument): Call {
    return Call.fromPrimitives({
      createdAt: document.createdAt,
      creatorIdentityId: document.creatorIdentityId,
      endedAt: document.endedAt,
      endedByIdentityId: document.endedByIdentityId,
      id: document.id,
      networkId: document.networkId,
      participantIds: document.participantIds,
      participants: document.participants,
      scope: document.scope,
      status: document.status,
    });
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
    return this.callIndex.find(key);
  }

  private cachedCallDocuments(): OrbitDBCallDocument[] {
    return this.registry
      .findCachedHeadsByPrefix('call:')
      .filter((document): document is OrbitDBCallDocument =>
        this.isDocument(document),
      );
  }

  private async callDocumentsFromIndexAndCache(
    key: string,
    filter: (document: OrbitDBCallDocument) => boolean,
  ): Promise<OrbitDBCallDocument[]> {
    return this.callIndex.deduplicate([
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

        return head && this.isDocument(head) ? head : document;
      }),
    );
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
    await this.callIndex.putDocuments(
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

  private async putCallHead(document: OrbitDBCallDocument): Promise<void> {
    await this.registry.putHead(
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

  public async findById(id: CallId): Promise<Call | undefined> {
    const head = await this.registry.findHead(this.callHeadKey(id.valueOf()));

    return head && this.isDocument(head) ? this.toDomain(head) : undefined;
  }

  public async findActiveByParticipant(
    participantId: IdentityId,
  ): Promise<Call[]> {
    const indexedDocuments = await this.findIndexDocuments(
      this.participantIndexHeadKey(participantId.valueOf()),
    );
    const documents = this.callIndex.deduplicate([
      ...(indexedDocuments ?? []),
      ...this.cachedCallDocuments().filter((document) =>
        document.participantIds.includes(participantId.valueOf()),
      ),
    ]);

    return documents
      .filter(
        (document) =>
          document.status === 'active' &&
          document.participants.some(
            (participant) =>
              participant.identityId === participantId.valueOf() &&
              ['joined', 'ringing'].includes(participant.status),
          ),
      )
      .map((document) => this.toDomain(document));
  }

  public async findByParticipant(participantId: IdentityId): Promise<Call[]> {
    const documents = await this.callDocumentsFromIndexAndCache(
      this.participantIndexHeadKey(participantId.valueOf()),
      (document) => document.participantIds.includes(participantId.valueOf()),
    );

    return documents.map((document) => this.toDomain(document));
  }

  public async findByConversationId(
    conversationId: ConversationId,
  ): Promise<Call[]> {
    const documents = await this.callDocumentsFromIndexAndCache(
      this.conversationIndexHeadKey(conversationId.valueOf()),
      (document) =>
        document.scope.type === 'conversation' &&
        document.scope.conversationId === conversationId.valueOf(),
    );

    return documents
      .sort((left, right) => left.createdAt - right.createdAt)
      .map((document) => this.toDomain(document));
  }

  public async findByCommunityChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): Promise<Call[]> {
    const documents = await this.callDocumentsFromIndexAndCache(
      this.communityChannelIndexHeadKey(
        communityId.valueOf(),
        channelId.valueOf(),
      ),
      (document) =>
        document.scope.type === 'community_channel' &&
        document.scope.communityId === communityId.valueOf() &&
        document.scope.channelId === channelId.valueOf(),
    );

    return documents
      .sort((left, right) => left.createdAt - right.createdAt)
      .map((document) => this.toDomain(document));
  }

  public async findActiveByCommunityChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): Promise<Call | undefined> {
    const indexedDocuments = await this.freshPrimaryDocuments(
      (await this.findIndexDocuments(
        this.communityChannelIndexHeadKey(
          communityId.valueOf(),
          channelId.valueOf(),
        ),
      )) ?? [],
    );
    const [document] = this.callIndex
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

    return document ? this.toDomain(document) : undefined;
  }

  public async findActiveByCommunity(
    communityId: CommunityId,
  ): Promise<Call[]> {
    const documents = await this.callDocumentsFromIndexAndCache(
      this.communityActiveIndexHeadKey(communityId.valueOf()),
      (document) =>
        document.scope.type === 'community_channel' &&
        document.scope.communityId === communityId.valueOf(),
    );

    return documents
      .filter((document) => document.status === 'active')
      .sort((left, right) => left.createdAt - right.createdAt)
      .map((document) => this.toDomain(document));
  }

  public async findTimedOutRingingCalls(
    timeoutThreshold: Timestamp,
  ): Promise<Call[]> {
    const documents = await this.callDocumentsFromIndexAndCache(
      this.activeIndexHeadKey(),
      (document) => document.status === 'active',
    );

    return documents
      .filter(
        (document) =>
          document.status === 'active' &&
          document.createdAt <= timeoutThreshold.valueOf() &&
          document.participants.some(
            (participant) => participant.status === 'ringing',
          ),
      )
      .map((document) => this.toDomain(document));
  }

  public async findTimedOutJoinedCalls(
    timeoutThreshold: Timestamp,
  ): Promise<Call[]> {
    const documents = await this.callDocumentsFromIndexAndCache(
      this.activeIndexHeadKey(),
      (document) => document.status === 'active',
    );

    return documents
      .filter(
        (document) =>
          document.status === 'active' &&
          document.participants.some(
            (participant) =>
              participant.status === 'joined' &&
              participant.lastSeenAt !== undefined &&
              participant.lastSeenAt <= timeoutThreshold.valueOf(),
          ),
      )
      .map((document) => this.toDomain(document));
  }

  public async save(call: Call): Promise<void> {
    const document = this.toDocument(call);

    await this.registry.putDocument('calls', document);
    await this.putCallHead(document);
    this.cacheCommunityChannelCall(document);
    this.refreshIndexesInBackground(document);
  }
}
