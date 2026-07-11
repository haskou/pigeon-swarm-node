import { CallId } from '@app/contexts/calls/domain/value-objects/CallId';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import ReplicatedStateNotReadyError from '@app/contexts/shared/infrastructure/orbitdb/ReplicatedStateNotReadyError';
import { Timestamp } from '@haskou/value-objects';

import { OrbitDBCallDocument } from './documents/OrbitDBCallDocument';

export default class OrbitDBCallProjection {
  private readonly activeCallIds = new Set<string>();

  private readonly communityCallIds = new Map<string, Set<string>>();

  private readonly communityChannelCallIds = new Map<string, Set<string>>();

  private readonly conversationCallIds = new Map<string, Set<string>>();

  private readonly documents = new Map<string, OrbitDBCallDocument>();

  private readonly participantCallIds = new Map<string, Set<string>>();

  private ready = false;

  private startPromise?: Promise<void>;

  constructor(private readonly registry: OrbitDBReplicatedStateRegistry) {}

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

  private addToIndex(
    index: Map<string, Set<string>>,
    key: string | undefined,
    callId: string,
  ): void {
    if (!key) {
      return;
    }

    const callIds = index.get(key) ?? new Set<string>();

    callIds.add(callId);
    index.set(key, callIds);
  }

  private removeFromIndex(
    index: Map<string, Set<string>>,
    key: string | undefined,
    callId: string,
  ): void {
    if (!key) {
      return;
    }

    const callIds = index.get(key);

    callIds?.delete(callId);

    if (callIds?.size === 0) {
      index.delete(key);
    }
  }

  private communityChannelKey(
    document: OrbitDBCallDocument,
  ): string | undefined {
    if (!document.scope.communityId || !document.scope.channelId) {
      return undefined;
    }

    return `${document.scope.communityId}:${document.scope.channelId}`;
  }

  private index(document: OrbitDBCallDocument): void {
    if (document.status === 'active') {
      this.activeCallIds.add(document.id);
    }

    for (const participantId of document.participantIds) {
      this.addToIndex(this.participantCallIds, participantId, document.id);
    }

    this.addToIndex(
      this.conversationCallIds,
      document.scope.conversationId,
      document.id,
    );
    this.addToIndex(
      this.communityCallIds,
      document.scope.communityId,
      document.id,
    );
    this.addToIndex(
      this.communityChannelCallIds,
      this.communityChannelKey(document),
      document.id,
    );
  }

  private unindex(document: OrbitDBCallDocument): void {
    this.activeCallIds.delete(document.id);

    for (const participantId of document.participantIds) {
      this.removeFromIndex(this.participantCallIds, participantId, document.id);
    }

    this.removeFromIndex(
      this.conversationCallIds,
      document.scope.conversationId,
      document.id,
    );
    this.removeFromIndex(
      this.communityCallIds,
      document.scope.communityId,
      document.id,
    );
    this.removeFromIndex(
      this.communityChannelCallIds,
      this.communityChannelKey(document),
      document.id,
    );
  }

  private documentsByIds(callIds: Iterable<string>): OrbitDBCallDocument[] {
    return [...callIds]
      .map((callId) => this.documents.get(callId))
      .filter(
        (document): document is OrbitDBCallDocument => document !== undefined,
      );
  }

  private projectRecord(document: Record<string, unknown>): void {
    if (!this.isDocument(document)) {
      return;
    }

    const current = this.documents.get(document.id);

    if (!current || this.freshness(current) <= this.freshness(document)) {
      if (current) {
        this.unindex(current);
      }

      this.documents.set(document.id, document);
      this.index(document);
    }
  }

  private assertReady(): void {
    if (!this.ready) {
      throw new ReplicatedStateNotReadyError();
    }
  }

  public async start(): Promise<void> {
    this.startPromise ??= this.registry
      .onDocumentUpdated('calls', (document) => this.projectRecord(document))
      .then(() => {
        this.ready = true;
      });

    await this.startPromise;
  }

  public project(document: OrbitDBCallDocument): void {
    this.assertReady();
    this.projectRecord(document);
  }

  public findById(id: CallId): Promise<OrbitDBCallDocument | undefined> {
    this.assertReady();

    return Promise.resolve(this.documents.get(id.valueOf()));
  }

  public findActiveByParticipant(
    participantId: IdentityId,
  ): Promise<OrbitDBCallDocument[]> {
    this.assertReady();

    return Promise.resolve(
      this.documentsByIds(
        this.participantCallIds.get(participantId.valueOf()) ?? [],
      ).filter(
        (document) =>
          document.status === 'active' &&
          document.participants.some(
            (participant) =>
              participant.identityId === participantId.valueOf() &&
              ['joined', 'ringing'].includes(participant.status),
          ),
      ),
    );
  }

  public findByParticipant(
    participantId: IdentityId,
  ): Promise<OrbitDBCallDocument[]> {
    this.assertReady();

    return Promise.resolve(
      this.documentsByIds(
        this.participantCallIds.get(participantId.valueOf()) ?? [],
      ),
    );
  }

  public findByConversationId(
    conversationId: ConversationId,
  ): Promise<OrbitDBCallDocument[]> {
    this.assertReady();

    return Promise.resolve(
      this.documentsByIds(
        this.conversationCallIds.get(conversationId.valueOf()) ?? [],
      ).sort((left, right) => left.createdAt - right.createdAt),
    );
  }

  public findByCommunityChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): Promise<OrbitDBCallDocument[]> {
    this.assertReady();

    return Promise.resolve(
      this.documentsByIds(
        this.communityChannelCallIds.get(
          `${communityId.valueOf()}:${channelId.valueOf()}`,
        ) ?? [],
      ).sort((left, right) => left.createdAt - right.createdAt),
    );
  }

  public async findActiveByCommunityChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): Promise<OrbitDBCallDocument | undefined> {
    this.assertReady();

    return (await this.findByCommunityChannel(communityId, channelId)).find(
      (document) => document.status === 'active',
    );
  }

  public findActiveByCommunity(
    communityId: CommunityId,
  ): Promise<OrbitDBCallDocument[]> {
    this.assertReady();

    return Promise.resolve(
      this.documentsByIds(
        this.communityCallIds.get(communityId.valueOf()) ?? [],
      )
        .filter(
          (document) =>
            document.status === 'active' &&
            document.scope.type === 'community_channel' &&
            document.scope.communityId === communityId.valueOf(),
        )
        .sort((left, right) => left.createdAt - right.createdAt),
    );
  }

  public findTimedOutRingingCalls(
    timeoutThreshold: Timestamp,
  ): Promise<OrbitDBCallDocument[]> {
    this.assertReady();

    return Promise.resolve(
      this.documentsByIds(this.activeCallIds).filter(
        (document) =>
          document.status === 'active' &&
          document.createdAt <= timeoutThreshold.valueOf() &&
          document.participants.some(
            (participant) => participant.status === 'ringing',
          ),
      ),
    );
  }
}
