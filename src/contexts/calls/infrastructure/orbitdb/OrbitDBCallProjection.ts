import { CallId } from '@app/contexts/calls/domain/value-objects/CallId';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { PublicMutationRecord } from '@app/contexts/public-mutations/domain/PublicMutationRecord';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import ReplicatedStateNotReadyError from '@app/contexts/shared/infrastructure/orbitdb/ReplicatedStateNotReadyError';
import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';
import { webSocketEventHub } from '@app/shared/infrastructure/websocket/WebSocketEventHub';
import { Timestamp } from '@haskou/value-objects';
import { isDeepStrictEqual } from 'node:util';

import {
  CallPrimitives,
  CallRecords,
  FoldedCall,
  OrbitDBCallFold,
} from './OrbitDBCallFold';

const SCOPE_TYPES = ['call_start', 'call_participant', 'call_end'];

/**
 * Folds the admitted signed call records into call state and keeps the lookup
 * indexes. Nothing here replicates: status, participants and missed marks are
 * derived from the records and local timeout marks on every node.
 */
export default class OrbitDBCallProjection {
  private readonly folded = new Map<string, FoldedCall>();

  private readonly records = new Map<string, CallRecords>();

  private readonly timedOut = new Map<string, number>();

  private readonly participantCallIds = new Map<string, Set<string>>();

  private readonly conversationCallIds = new Map<string, Set<string>>();

  private readonly communityCallIds = new Map<string, Set<string>>();

  private readonly communityChannelCallIds = new Map<string, Set<string>>();

  private readonly creatorScopeCallIds = new Map<string, Set<string>>();

  private ready = false;

  private startPromise?: Promise<void>;

  private static maxDurationMs(): number {
    return pigeonEnvironment().CALLS_MAX_DURATION_MS;
  }

  constructor(private readonly registry: OrbitDBReplicatedStateRegistry) {}

  private assertReady(): void {
    if (!this.ready) throw new ReplicatedStateNotReadyError();
  }

  private callIdOf(record: Record<string, unknown>): string | undefined {
    return typeof record.callId === 'string' ? record.callId : undefined;
  }

  private isRecord(record: Record<string, unknown>): boolean {
    return (
      SCOPE_TYPES.includes(record.scopeType as string) &&
      typeof record.id === 'string' &&
      this.callIdOf(record) !== undefined
    );
  }

  private keep(
    current: Record<string, unknown> | undefined,
    candidate: Record<string, unknown>,
  ): Record<string, unknown> {
    return !current ||
      PublicMutationRecord.replaces(current, candidate) !== false
      ? candidate
      : current;
  }

  private store(callId: string, record: Record<string, unknown>): void {
    const records = this.records.get(callId) ?? {
      participants: new Map<string, Record<string, unknown>>(),
    };

    if (record.scopeType === 'call_start') {
      records.start = this.keep(records.start, record);
    } else if (record.scopeType === 'call_end') {
      records.end = this.keep(records.end, record);
    } else {
      const identityId = record.identityId as string;

      records.participants.set(
        identityId,
        this.keep(records.participants.get(identityId), record),
      );
    }

    this.records.set(callId, records);
  }

  private addToIndex(
    index: Map<string, Set<string>>,
    key: string | undefined,
    callId: string,
  ): void {
    if (!key) return;

    const callIds = index.get(key) ?? new Set<string>();

    callIds.add(callId);
    index.set(key, callIds);
  }

  private removeFromIndex(
    index: Map<string, Set<string>>,
    key: string | undefined,
    callId: string,
  ): void {
    if (!key) return;

    const callIds = index.get(key);

    callIds?.delete(callId);

    if (callIds?.size === 0) index.delete(key);
  }

  private communityChannelKey(primitives: CallPrimitives): string | undefined {
    const { channelId, communityId } = primitives.scope;

    return communityId && channelId ? `${communityId}:${channelId}` : undefined;
  }

  private creatorScopeKey(primitives: CallPrimitives): string {
    const { channelId, communityId, conversationId } = primitives.scope;

    return `${primitives.creatorIdentityId}:${conversationId ?? `${communityId}:${channelId}`}`;
  }

  private applyIndexes(
    primitives: CallPrimitives,
    action: (
      index: Map<string, Set<string>>,
      key: string | undefined,
      callId: string,
    ) => void,
  ): void {
    for (const participantId of primitives.participantIds) {
      action(this.participantCallIds, participantId, primitives.id);
    }

    action(
      this.conversationCallIds,
      primitives.scope.conversationId,
      primitives.id,
    );
    action(this.communityCallIds, primitives.scope.communityId, primitives.id);
    action(
      this.communityChannelCallIds,
      this.communityChannelKey(primitives),
      primitives.id,
    );
    action(
      this.creatorScopeCallIds,
      this.creatorScopeKey(primitives),
      primitives.id,
    );
  }

  private refold(callId: string): void {
    const previous = this.folded.get(callId);
    const next = OrbitDBCallFold.fold(
      this.records.get(callId)!,
      this.timedOut.get(callId),
    );

    if (isDeepStrictEqual(previous, next)) return;

    if (previous) {
      this.applyIndexes(previous.primitives, (index, key, id) =>
        this.removeFromIndex(index, key, id),
      );
    }

    if (next) {
      this.folded.set(callId, next);
      this.applyIndexes(next.primitives, (index, key, id) =>
        this.addToIndex(index, key, id),
      );
    } else {
      this.folded.delete(callId);
    }

    this.publishWithPeers(next ?? previous);
  }

  private publishWithPeers(folded: FoldedCall | undefined): void {
    if (!folded) return;

    const { primitives } = folded;
    const peers = new Set<string>([
      primitives.id,
      ...(this.creatorScopeCallIds.get(this.creatorScopeKey(primitives)) ?? []),
      ...(this.communityChannelCallIds.get(
        this.communityChannelKey(primitives) ?? '',
      ) ?? []),
    ]);

    for (const callId of peers) webSocketEventHub.publishCallSnapshot(callId);
  }

  private project(record: Record<string, unknown>): void {
    if (!this.isRecord(record)) return;

    const callId = this.callIdOf(record)!;

    this.store(callId, record);
    this.refold(callId);
  }

  /** Ends a folded call that outlived the maximum duration. */
  private withinDuration(folded: FoldedCall): CallPrimitives {
    const { primitives } = folded;
    const expiresAt =
      primitives.createdAt + OrbitDBCallProjection.maxDurationMs();

    return primitives.status === 'active' &&
      expiresAt <= Timestamp.now().valueOf()
      ? { ...primitives, endedAt: expiresAt, status: 'ended' }
      : primitives;
  }

  private isLive(folded: FoldedCall): boolean {
    return this.withinDuration(folded).status === 'active';
  }

  /**
   * One live call per creator and scope (the latest start) and, in a community
   * channel, the live start with the lowest digest. Every other start of that
   * scope is a loser that reads as ended on every node alike.
   */
  private isSuperseded(folded: FoldedCall): boolean {
    const { primitives } = folded;
    const sameCreator = [
      ...(this.creatorScopeCallIds.get(this.creatorScopeKey(primitives)) ?? []),
    ]
      .map((id) => this.folded.get(id))
      .filter(
        (candidate): candidate is FoldedCall =>
          candidate !== undefined && this.isLive(candidate),
      );
    const latest = sameCreator.reduce((best, candidate) =>
      candidate.primitives.createdAt > best.primitives.createdAt ||
      (candidate.primitives.createdAt === best.primitives.createdAt &&
        candidate.primitives.id > best.primitives.id)
        ? candidate
        : best,
    );

    if (latest.primitives.id !== primitives.id) return true;

    const channelKey = this.communityChannelKey(primitives);

    if (!channelKey) return false;

    const survivors = [...(this.communityChannelCallIds.get(channelKey) ?? [])]
      .map((id) => this.folded.get(id))
      .filter(
        (candidate): candidate is FoldedCall =>
          candidate !== undefined &&
          this.isLive(candidate) &&
          !this.isLatestOfCreatorOnly(candidate),
      );

    return survivors.some(
      (candidate) =>
        candidate.primitives.id !== primitives.id &&
        candidate.digest < folded.digest,
    );
  }

  /** True when a newer live start of the same creator and scope replaces it. */
  private isLatestOfCreatorOnly(folded: FoldedCall): boolean {
    const { primitives } = folded;

    return [
      ...(this.creatorScopeCallIds.get(this.creatorScopeKey(primitives)) ?? []),
    ]
      .map((id) => this.folded.get(id))
      .some(
        (candidate) =>
          candidate !== undefined &&
          candidate.primitives.id !== primitives.id &&
          this.isLive(candidate) &&
          (candidate.primitives.createdAt > primitives.createdAt ||
            (candidate.primitives.createdAt === primitives.createdAt &&
              candidate.primitives.id > primitives.id)),
      );
  }

  private resolve(callId: string): CallPrimitives | undefined {
    const folded = this.folded.get(callId);

    if (!folded) return undefined;

    const primitives = this.withinDuration(folded);

    if (primitives.status === 'active' && this.isSuperseded(folded)) {
      return {
        ...primitives,
        endedAt: Math.max(primitives.createdAt, Timestamp.now().valueOf()),
        status: 'ended',
      };
    }

    return primitives;
  }

  private resolveAll(callIds: Iterable<string>): CallPrimitives[] {
    return [...callIds]
      .map((callId) => this.resolve(callId))
      .filter((primitives): primitives is CallPrimitives => !!primitives);
  }

  public async start(): Promise<void> {
    this.startPromise ??= this.registry
      .onDocumentUpdated('calls', (record) => this.project(record), {
        includeHistory: true,
      })
      .then(() => {
        this.ready = true;
      });

    await this.startPromise;
  }

  /** Marks a ringing call as missed on this node; nothing replicates. */
  public markTimedOut(callId: CallId, at: number): void {
    this.assertReady();

    if (!this.records.has(callId.valueOf())) return;

    this.timedOut.set(callId.valueOf(), at);
    this.refold(callId.valueOf());
  }

  public findById(id: CallId): Promise<CallPrimitives | undefined> {
    this.assertReady();

    return Promise.resolve(this.resolve(id.valueOf()));
  }

  public findActiveByParticipant(
    participantId: IdentityId,
  ): Promise<CallPrimitives[]> {
    this.assertReady();

    return Promise.resolve(
      this.resolveAll(
        this.participantCallIds.get(participantId.valueOf()) ?? [],
      ).filter(
        (primitives) =>
          primitives.status === 'active' &&
          primitives.participants.some(
            (participant) =>
              participant.identityId === participantId.valueOf() &&
              ['joined', 'ringing'].includes(participant.status),
          ),
      ),
    );
  }

  public findActiveCommunityCalls(): Promise<CallPrimitives[]> {
    this.assertReady();

    return Promise.resolve(
      this.resolveAll(
        [...this.communityCallIds.values()].flatMap((ids) => [...ids]),
      ).filter((primitives) => primitives.status === 'active'),
    );
  }

  public findByParticipant(
    participantId: IdentityId,
  ): Promise<CallPrimitives[]> {
    this.assertReady();

    return Promise.resolve(
      this.resolveAll(
        this.participantCallIds.get(participantId.valueOf()) ?? [],
      ),
    );
  }

  public findByConversationId(
    conversationId: ConversationId,
  ): Promise<CallPrimitives[]> {
    this.assertReady();

    return Promise.resolve(
      this.resolveAll(
        this.conversationCallIds.get(conversationId.valueOf()) ?? [],
      ).sort((left, right) => left.createdAt - right.createdAt),
    );
  }

  public findByCommunityChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): Promise<CallPrimitives[]> {
    this.assertReady();

    return Promise.resolve(
      this.resolveAll(
        this.communityChannelCallIds.get(
          `${communityId.valueOf()}:${channelId.valueOf()}`,
        ) ?? [],
      ).sort((left, right) => left.createdAt - right.createdAt),
    );
  }

  public async findActiveByCommunityChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): Promise<CallPrimitives | undefined> {
    return (await this.findByCommunityChannel(communityId, channelId)).find(
      (primitives) => primitives.status === 'active',
    );
  }

  public findActiveByCommunity(
    communityId: CommunityId,
  ): Promise<CallPrimitives[]> {
    this.assertReady();

    return Promise.resolve(
      this.resolveAll(this.communityCallIds.get(communityId.valueOf()) ?? [])
        .filter(
          (primitives) =>
            primitives.status === 'active' &&
            primitives.scope.type === 'community_channel',
        )
        .sort((left, right) => left.createdAt - right.createdAt),
    );
  }

  public findTimedOutRingingCalls(
    timeoutThreshold: Timestamp,
  ): Promise<CallPrimitives[]> {
    this.assertReady();

    return Promise.resolve(
      this.resolveAll(this.folded.keys()).filter(
        (primitives) =>
          primitives.status === 'active' &&
          primitives.createdAt <= timeoutThreshold.valueOf() &&
          primitives.participants.some(
            (participant) => participant.status === 'ringing',
          ),
      ),
    );
  }
}
