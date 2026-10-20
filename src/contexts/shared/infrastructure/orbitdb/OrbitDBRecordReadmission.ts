import Kernel from '@haskou/ddd-kernel';

import { OrbitDBPendingRecordReadmission } from './OrbitDBPendingRecordReadmission';

/**
 * A replicated record is judged once, when it arrives. The rejection can be
 * transient: the record may rest on authorization that replicates after it
 * (a call start of a member whose join has not reached this node yet). A
 * record is never replayed on its own, so a record rejected for that reason
 * would stay lost for good. It is offered again a few times with backoff,
 * only while its store is still registered, and every time the node admits
 * new replicated state in between: the state it rests on may be what just
 * arrived. Past the last backoff delay the rejection is final.
 *
 * A scope that outgrows both its active bound and its queue drops the record
 * and is marked overflowed: reads of it wait (see `isOverflowed`) until its
 * offers have drained and its rescan has completed without dropping anything.
 */
type QueuedRecord = {
  isCurrent: () => boolean;
  offer: () => Promise<boolean>;
  subject?: string;
};

/** The offers of one scope: the active ones, and the queue behind them. */
type ScopeReadmissions = {
  active: Map<unknown, OrbitDBPendingRecordReadmission>;
  queued: Map<unknown, QueuedRecord>;
  reconcile?: () => Promise<void>;
  /** Records dropped since the scope was last readmitted in full. */
  dropped: number;
  overflowed: boolean;
  reconciling: boolean;
  retry?: NodeJS.Timeout;
};

export class OrbitDBRecordReadmission {
  private static readonly MAX_PENDING_PER_SCOPE = 256;

  /** Records past the active bound wait here, in arrival order, for a slot. */
  private static readonly MAX_QUEUED_PER_SCOPE = 256;

  /** A rescan that failed, or dropped records meanwhile, is retried after this. */
  private static readonly RESCAN_RETRY_MS = 60_000;

  public static readonly DELAYS_MS = [2_000, 10_000, 60_000];

  /**
   * New state is admitted in bursts and the authorization lookups it feeds
   * are cached for a moment, so the pending records are offered again once
   * per this delay, however much state arrives meanwhile.
   */
  public static readonly WAKE_DELAY_MS = 2_000;

  /**
   * Neither a wake nor the backoff waits longer than this for one offer, so
   * a lookup that never resolves stalls neither the later wakes nor the
   * retirement of its record. The offer itself keeps running and is not
   * started twice.
   */
  public static readonly OFFER_WAIT_MS = 5_000;

  private readonly scopes = new Map<string | object, ScopeReadmissions>();

  /** How many pending records name each subject, queued ones included. */
  private readonly pendingCountBySubject = new Map<string, number>();

  private wakeTimer?: NodeJS.Timeout;

  private draining = false;

  private rewake = false;

  private async drain(): Promise<void> {
    this.draining = true;

    try {
      const readmissions = [...this.scopes.values()].flatMap((scope) => [
        ...scope.active.values(),
      ]);

      for (const readmission of readmissions) await readmission.offer();
    } finally {
      this.draining = false;

      if (this.rewake) {
        this.rewake = false;
        this.wake();
      }
    }
  }

  private countSubject(subject: string | undefined, delta: 1 | -1): void {
    if (subject === undefined) return;

    const count = (this.pendingCountBySubject.get(subject) ?? 0) + delta;

    if (count === 0) this.pendingCountBySubject.delete(subject);
    else this.pendingCountBySubject.set(subject, count);
  }

  private start(
    scope: string | object,
    state: ScopeReadmissions,
    entryKey: unknown,
    record: QueuedRecord,
  ): void {
    const readmission = new OrbitDBPendingRecordReadmission(
      OrbitDBRecordReadmission.DELAYS_MS,
      OrbitDBRecordReadmission.OFFER_WAIT_MS,
      record.offer,
      record.isCurrent,
      () => this.settle(scope, state, entryKey, record.subject),
    );

    state.active.set(entryKey, readmission);
    readmission.start();
  }

  private settle(
    scope: string | object,
    state: ScopeReadmissions,
    entryKey: unknown,
    subject: string | undefined,
  ): void {
    state.active.delete(entryKey);
    this.countSubject(subject, -1);

    const next = state.queued.entries().next();

    if (!next.done) {
      const [queuedKey, record] = next.value;

      state.queued.delete(queuedKey);
      this.start(scope, state, queuedKey, record);

      return;
    }

    this.checkDrained(scope, state);
  }

  private checkDrained(scope: string | object, state: ScopeReadmissions): void {
    if (
      state.active.size > 0 ||
      state.queued.size > 0 ||
      state.reconciling ||
      state.retry
    )
      return;

    if (state.overflowed && state.reconcile) {
      void this.rescan(scope, state, state.reconcile);

      return;
    }

    if (state.overflowed) this.clearOverflow(state);

    this.scopes.delete(scope);
  }

  private async rescan(
    scope: string | object,
    state: ScopeReadmissions,
    reconcile: () => Promise<void>,
  ): Promise<void> {
    const droppedBefore = state.dropped;
    let complete = true;

    state.reconciling = true;

    try {
      await reconcile();
    } catch {
      complete = false;
      Kernel.logger.warn?.('OrbitDB record re-admission rescan failed');
    } finally {
      state.reconciling = false;
    }

    if (complete && state.dropped === droppedBefore) {
      this.clearOverflow(state);
      this.checkDrained(scope, state);

      return;
    }

    if (state.active.size === 0 && state.queued.size === 0)
      this.retryRescan(scope, state);
  }

  private retryRescan(scope: string | object, state: ScopeReadmissions): void {
    state.retry = setTimeout(() => {
      state.retry = undefined;
      this.checkDrained(scope, state);
    }, OrbitDBRecordReadmission.RESCAN_RETRY_MS);
    state.retry.unref();
  }

  private overflow(state: ScopeReadmissions): void {
    if (!state.overflowed)
      Kernel.logger.warn?.(
        'OrbitDB record re-admission overflowed: reads wait until the scope is readmitted',
      );

    state.overflowed = true;
    state.dropped += 1;
  }

  private clearOverflow(state: ScopeReadmissions): void {
    Kernel.logger.debug?.(
      `OrbitDB record re-admission overflow cleared: dropped=${state.dropped}`,
    );
    state.overflowed = false;
    state.dropped = 0;
  }

  /**
   * Whether a record scheduled under the subject still waits to be offered
   * again: the node holds it but has not admitted it yet, and may still.
   */
  public isPending(subject: string): boolean {
    return this.pendingCountBySubject.has(subject);
  }

  /**
   * Whether the scope dropped records it had no room for and has not
   * readmitted them since. A read of the scope then waits: it must not
   * answer "missing" or a partial list. The flag clears once the scope's
   * offers have drained and its rescan completed without dropping anything.
   */
  public isOverflowed(scope: string | object): boolean {
    return this.scopes.get(scope)?.overflowed === true;
  }

  /**
   * The offers are bounded per scope (a network or a store): past the active
   * bound a record waits in a FIFO queue of the same size, and past both it
   * is dropped and the scope is overflowed. So a flood of pending records
   * cannot pin them in memory, multiply the work of a wake, or take the place
   * of the records of another scope. A record whose key is already pending is
   * not scheduled again, so a record received many times waits once and keeps
   * its first wait. `subject` names what the record is about, for `isPending`;
   * unlike the key it never merges records, so a forged record about a subject
   * cannot take the place of a legitimate one. `offer` admits and delivers the
   * record, and resolves whether it is settled. `reconcile` readmits what the
   * scope holds, once its offers have drained; the overflow clears only after
   * it completes. A scope without one has nothing to readmit.
   */
  public schedule({
    isCurrent,
    key,
    offer,
    reconcile,
    scope,
    subject,
  }: {
    isCurrent: () => boolean;
    key?: string;
    offer: () => Promise<boolean>;
    reconcile?: () => Promise<void>;
    scope: string | object;
    subject?: string;
  }): void {
    const state = this.scopes.get(scope) ?? {
      active: new Map<unknown, OrbitDBPendingRecordReadmission>(),
      dropped: 0,
      overflowed: false,
      queued: new Map<unknown, QueuedRecord>(),
      reconcile,
      reconciling: false,
    };
    const entryKey = key ?? Symbol('record');

    this.scopes.set(scope, state);

    if (state.active.has(entryKey) || state.queued.has(entryKey)) return;

    if (
      state.active.size >= OrbitDBRecordReadmission.MAX_PENDING_PER_SCOPE &&
      state.queued.size >= OrbitDBRecordReadmission.MAX_QUEUED_PER_SCOPE
    ) {
      this.overflow(state);

      return;
    }

    this.countSubject(subject, 1);
    const record = { isCurrent, offer, subject };

    if (state.active.size < OrbitDBRecordReadmission.MAX_PENDING_PER_SCOPE)
      this.start(scope, state, entryKey, record);
    else state.queued.set(entryKey, record);
  }

  /**
   * Signals that the node admitted new replicated state. The pending records
   * are offered one after the other, never more than one wake at a time. A
   * wake never extends how long a record waits: the backoff schedule alone
   * retires it.
   */
  public wake(): void {
    if (this.draining) {
      this.rewake = true;

      return;
    }

    if (this.wakeTimer || this.scopes.size === 0) return;

    this.wakeTimer = setTimeout(() => {
      this.wakeTimer = undefined;
      void this.drain();
    }, OrbitDBRecordReadmission.WAKE_DELAY_MS);
    this.wakeTimer.unref();
  }
}
