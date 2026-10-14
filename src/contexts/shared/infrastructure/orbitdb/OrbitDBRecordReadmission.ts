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
 */
export class OrbitDBRecordReadmission {
  private static readonly MAX_PENDING_PER_SCOPE = 256;

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

  private readonly pendingByScope = new Map<
    string | object,
    Map<unknown, OrbitDBPendingRecordReadmission>
  >();

  private wakeTimer?: NodeJS.Timeout;

  private draining = false;

  private rewake = false;

  private async drain(): Promise<void> {
    this.draining = true;

    try {
      const readmissions = [...this.pendingByScope.values()].flatMap(
        (pending) => [...pending.values()],
      );

      for (const readmission of readmissions) await readmission.offer();
    } finally {
      this.draining = false;

      if (this.rewake) {
        this.rewake = false;
        this.wake();
      }
    }
  }

  /**
   * The pending offers are bounded per scope (a network or a store), so a
   * flood of rejected records cannot pin them in memory, multiply the work
   * of a wake, or take the place of the records of another scope; past the
   * bound a rejection is final. A record whose key is already pending is
   * not scheduled again, so a record received many times waits once and
   * keeps its first wait. `offer` admits and delivers the record, and
   * resolves whether it is settled.
   */
  public schedule({
    isCurrent,
    key,
    offer,
    scope,
  }: {
    isCurrent: () => boolean;
    key?: string;
    offer: () => Promise<boolean>;
    scope: string | object;
  }): void {
    const pending =
      this.pendingByScope.get(scope) ??
      new Map<unknown, OrbitDBPendingRecordReadmission>();
    const entryKey = key ?? Symbol('record');

    if (pending.has(entryKey)) return;

    if (pending.size >= OrbitDBRecordReadmission.MAX_PENDING_PER_SCOPE) return;
    const readmission = new OrbitDBPendingRecordReadmission(
      OrbitDBRecordReadmission.DELAYS_MS,
      OrbitDBRecordReadmission.OFFER_WAIT_MS,
      offer,
      isCurrent,
      () => {
        pending.delete(entryKey);

        if (pending.size === 0) this.pendingByScope.delete(scope);
      },
    );

    pending.set(entryKey, readmission);
    this.pendingByScope.set(scope, pending);
    readmission.start();
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

    if (this.wakeTimer || this.pendingByScope.size === 0) return;

    this.wakeTimer = setTimeout(() => {
      this.wakeTimer = undefined;
      void this.drain();
    }, OrbitDBRecordReadmission.WAKE_DELAY_MS);
    this.wakeTimer.unref();
  }
}
