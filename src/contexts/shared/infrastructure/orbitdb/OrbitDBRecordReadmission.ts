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
  private static readonly MAX_PENDING = 256;

  public static readonly DELAYS_MS = [2_000, 10_000, 60_000];

  /**
   * New state is admitted in bursts and the authorization lookups it feeds
   * are cached for a moment, so the pending records are offered again once
   * per this delay, however much state arrives meanwhile.
   */
  public static readonly WAKE_DELAY_MS = 2_000;

  private readonly pending = new Set<OrbitDBPendingRecordReadmission>();

  private wakeTimer?: NodeJS.Timeout;

  /**
   * The pending offers are bounded so that a flood of rejected records cannot
   * pin them in memory or multiply the work of a wake; past the bound a
   * rejection is final, as it was before records were re-admitted. `offer`
   * admits and delivers the record, and resolves whether it is settled.
   */
  public schedule(
    offer: () => Promise<boolean>,
    isCurrent: () => boolean,
  ): void {
    if (this.pending.size >= OrbitDBRecordReadmission.MAX_PENDING) return;
    const readmission = new OrbitDBPendingRecordReadmission(
      OrbitDBRecordReadmission.DELAYS_MS,
      offer,
      isCurrent,
      () => this.pending.delete(readmission),
    );

    this.pending.add(readmission);
    readmission.start();
  }

  /**
   * Signals that the node admitted new replicated state. It never extends
   * how long a record waits: the backoff schedule alone retires it.
   */
  public wake(): void {
    if (this.wakeTimer || this.pending.size === 0) return;

    this.wakeTimer = setTimeout(() => {
      this.wakeTimer = undefined;

      for (const readmission of [...this.pending]) {
        void readmission.offer();
      }
    }, OrbitDBRecordReadmission.WAKE_DELAY_MS);
    this.wakeTimer.unref();
  }
}
