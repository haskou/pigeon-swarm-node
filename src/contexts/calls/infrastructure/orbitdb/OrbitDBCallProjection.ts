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

import { CallPrimitives } from './CallPrimitives';
import { CallRecords } from './CallRecords';
import { FoldedCall } from './FoldedCall';
import { OrbitDBCallFold } from './OrbitDBCallFold';

const SCOPE_TYPES = ['call_start', 'call_participant', 'call_end'];

/**
 * Folds the admitted signed call records into call state and keeps the lookup
 * indexes. Nothing here replicates: status, participants and missed marks are
 * derived from the records and local timeout marks on every node.
 */
export default class OrbitDBCallProjection {
  private static readonly MAX_WAITERS = 256;

  private readonly folded = new Map<string, FoldedCall>();

  private readonly records = new Map<string, CallRecords>();

  private readonly timedOut = new Map<string, number>();

  private readonly participantCallIds = new Map<string, Set<string>>();

  private readonly conversationCallIds = new Map<string, Set<string>>();

  private readonly communityCallIds = new Map<string, Set<string>>();

  private readonly communityChannelCallIds = new Map<string, Set<string>>();

  private readonly groupCapabilityCallIds = new Map<string, Set<string>>();

  private readonly creatorScopeCallIds = new Map<string, Set<string>>();

  private readonly waiters = new Map<string, Set<() => void>>();

  /** Calls whose start cannot be folded right now. */
  private readonly unreadable = new Set<string>();

  private waiterCount = 0;

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
    const { capabilityHash, channelId, communityId, conversationId } =
      primitives.scope;

    return `${primitives.creatorIdentityId}:${conversationId ?? capabilityHash ?? `${communityId}:${channelId}`}`;
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
      this.groupCapabilityCallIds,
      primitives.scope.capabilityHash,
      primitives.id,
    );
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

  /**
   * A start that cannot be folded marks the call unreadable and keeps its last
   * fold and indexes: the call is answered as not ready, never dropped.
   */
  private refold(callId: string): void {
    const records = this.records.get(callId)!;
    const previous = this.folded.get(callId);
    let next: FoldedCall | undefined;

    try {
      next = OrbitDBCallFold.fold(records, this.timedOut.get(callId));
    } catch {
      this.unreadable.add(callId);

      return;
    }

    this.unreadable.delete(callId);

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
    this.notifyWaiters(callId);
  }

  private notifyWaiters(callId: string): void {
    const waiting = this.waiters.get(callId);

    if (!waiting) return;

    this.waiters.delete(callId);

    for (const wake of waiting) wake();
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

  private liveCalls(callIds: Set<string> | undefined): FoldedCall[] {
    return [...(callIds ?? [])]
      .map((id) => this.folded.get(id))
      .filter(
        (candidate): candidate is FoldedCall =>
          candidate !== undefined && this.isLive(candidate),
      );
  }

  private startedAfter(candidate: FoldedCall, other: FoldedCall): boolean {
    const [left, right] = [candidate.primitives, other.primitives];

    return (
      left.createdAt > right.createdAt ||
      (left.createdAt === right.createdAt && left.id > right.id)
    );
  }

  private isLatestOfCreator(folded: FoldedCall): boolean {
    return !this.liveCalls(
      this.creatorScopeCallIds.get(this.creatorScopeKey(folded.primitives)),
    ).some((candidate) => this.startedAfter(candidate, folded));
  }

  /** The live latest-of-creator start of a community channel with the lowest digest. */
  private channelWinner(channelKey: string): FoldedCall | undefined {
    return this.liveCalls(this.communityChannelCallIds.get(channelKey))
      .filter((candidate) => this.isLatestOfCreator(candidate))
      .reduce<FoldedCall | undefined>(
        (winner, candidate) =>
          !winner || candidate.digest < winner.digest ? candidate : winner,
        undefined,
      );
  }

  /**
   * One live call per creator and scope (the latest start) and, in a community
   * channel, the live start with the lowest digest. Every other start of that
   * scope is a loser that reads as ended on every node alike. Returns undefined
   * for a call that is not superseded; a community channel loser names the
   * winner its participants move to.
   */
  private supersession(
    folded: FoldedCall,
  ): { winnerId: string | undefined } | undefined {
    const channelKey = this.communityChannelKey(folded.primitives);
    const winner = channelKey ? this.channelWinner(channelKey) : undefined;

    if (this.isLatestOfCreator(folded) && (!winner || winner === folded)) {
      return undefined;
    }

    return { winnerId: winner?.primitives.id };
  }

  /**
   * Throws not ready for a call it cannot fold, and for one whose other
   * records it holds without their start: those are admitted only after their
   * start, so the start exists and is not yet projected, never absent.
   */
  private resolve(callId: string): CallPrimitives | undefined {
    if (this.unreadable.has(callId)) throw new ReplicatedStateNotReadyError();

    const folded = this.folded.get(callId);

    if (!folded) {
      if (this.records.has(callId)) throw new ReplicatedStateNotReadyError();

      return undefined;
    }

    const primitives = this.withinDuration(folded);
    const supersession =
      primitives.status === 'active' ? this.supersession(folded) : undefined;

    if (supersession) {
      return {
        ...primitives,
        endedAt: Math.max(primitives.createdAt, Timestamp.now().valueOf()),
        status: 'ended',
        ...(supersession.winnerId
          ? { supersededByCallId: supersession.winnerId }
          : {}),
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

  /**
   * Resolves true when another signed record of the call is admitted and false
   * on timeout or when too many waiters are pending: a bound against claims
   * about calls that never arrive.
   */
  public awaitUpdate(callId: CallId, timeoutMs: number): Promise<boolean> {
    if (this.waiterCount >= OrbitDBCallProjection.MAX_WAITERS) {
      return Promise.resolve(false);
    }

    return new Promise<boolean>((resolve) => {
      const key = callId.valueOf();
      const waiting = this.waiters.get(key) ?? new Set<() => void>();
      const waiter = {
        timer: undefined as NodeJS.Timeout | undefined,
        wake: (): void => {
          clearTimeout(waiter.timer);
          this.waiterCount--;
          resolve(true);
        },
      };

      waiter.timer = setTimeout(() => {
        waiting.delete(waiter.wake);

        if (waiting.size === 0 && this.waiters.get(key) === waiting) {
          this.waiters.delete(key);
        }

        this.waiterCount--;
        resolve(false);
      }, timeoutMs);
      waiting.add(waiter.wake);
      this.waiters.set(key, waiting);
      this.waiterCount++;
    });
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

  /** Active calls whose roster is their participation leases, not their records. */
  public findActiveLeaseRosteredCalls(): Promise<CallPrimitives[]> {
    this.assertReady();

    return Promise.resolve(
      this.resolveAll(
        [
          ...this.communityCallIds.values(),
          ...this.groupCapabilityCallIds.values(),
        ].flatMap((ids) => [...ids]),
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

  /** A call it cannot read is never marked missed, so it is left out here. */
  public findTimedOutRingingCalls(
    timeoutThreshold: Timestamp,
  ): Promise<CallPrimitives[]> {
    this.assertReady();

    return Promise.resolve(
      this.resolveAll(
        [...this.folded.keys()].filter((id) => !this.unreadable.has(id)),
      ).filter(
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
