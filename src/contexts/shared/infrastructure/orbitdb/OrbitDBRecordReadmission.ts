import Kernel from '@haskou/ddd-kernel';

/**
 * A replicated record is judged once, when it arrives. The rejection can be
 * transient: the record may rest on authorization that replicates after it
 * (a call start of a member whose join has not reached this node yet). A
 * document is never replayed on its own, so a record rejected for that reason
 * would stay lost for good. It is offered again a few times with backoff, and
 * only while its store is still registered.
 */
export class OrbitDBRecordReadmission {
  private static readonly MAX_PENDING = 256;

  public static readonly DELAYS_MS = [2_000, 10_000, 60_000];

  private pending = 0;

  private pause(delayMs: number): Promise<void> {
    const { promise, resolve } = Promise.withResolvers<void>();

    setTimeout(resolve, delayMs).unref();

    return promise;
  }

  private async offer(
    admit: () => Promise<boolean>,
    deliver: () => void | Promise<void>,
    isCurrent: () => boolean,
  ): Promise<void> {
    for (const delayMs of OrbitDBRecordReadmission.DELAYS_MS) {
      await this.pause(delayMs);

      if (!isCurrent()) return;

      if (await admit()) {
        await deliver();

        return;
      }
    }
  }

  /**
   * The pending offers are bounded so that a flood of rejected records cannot
   * pin them in memory; past the bound a rejection is final, as it was before
   * records were re-admitted.
   */
  public schedule(
    admit: () => Promise<boolean>,
    deliver: () => void | Promise<void>,
    isCurrent: () => boolean,
  ): void {
    if (this.pending >= OrbitDBRecordReadmission.MAX_PENDING) return;

    this.pending += 1;
    void this.offer(admit, deliver, isCurrent)
      .catch(() => {
        Kernel.logger.warn?.('OrbitDB record re-admission failed');
      })
      .finally(() => {
        this.pending -= 1;
      });
  }
}
