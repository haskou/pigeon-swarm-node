import Kernel from '@haskou/ddd-kernel';

/**
 * One rejected record waiting to be offered again. It is offered after each
 * backoff delay and whenever it is woken; one offer runs at a time, and the
 * record settles once it is delivered, its store is gone, or the last delay
 * passed.
 */
export class OrbitDBPendingRecordReadmission {
  private attempt = 0;

  private offering = false;

  private settled = false;

  private timer?: NodeJS.Timeout;

  constructor(
    private readonly delaysMs: readonly number[],
    private readonly offerRecord: () => Promise<boolean>,
    private readonly isCurrent: () => boolean,
    private readonly onSettled: () => void,
  ) {}

  private arm(): void {
    const delayMs = this.delaysMs[this.attempt];

    if (delayMs === undefined) {
      this.settle();

      return;
    }

    this.timer = setTimeout(() => {
      this.attempt += 1;
      void this.offer().finally(() => {
        if (!this.settled) this.arm();
      });
    }, delayMs);
    this.timer.unref();
  }

  private settle(): void {
    this.settled = true;
    clearTimeout(this.timer);
    this.onSettled();
  }

  public start(): void {
    this.arm();
  }

  public async offer(): Promise<void> {
    if (this.offering || this.settled) return;

    this.offering = true;

    try {
      if (!this.isCurrent() || (await this.offerRecord())) this.settle();
    } catch {
      this.settle();
      Kernel.logger.warn?.('OrbitDB record re-admission failed');
    } finally {
      this.offering = false;
    }
  }
}
