import Kernel from '@haskou/ddd-kernel';

/**
 * One rejected record waiting to be offered again. It is offered after each
 * backoff delay and whenever it is woken; one offer runs at a time, and the
 * record settles once it is delivered, its store is gone, or the last delay
 * passed.
 */
export class OrbitDBPendingRecordReadmission {
  private attempt = 0;

  private inFlight?: Promise<void>;

  private settled = false;

  private timer?: NodeJS.Timeout;

  constructor(
    private readonly delaysMs: readonly number[],
    private readonly offerWaitMs: number,
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
    if (this.settled) return;
    this.settled = true;
    clearTimeout(this.timer);
    this.onSettled();
  }

  private async attemptOffer(): Promise<void> {
    try {
      if (!this.isCurrent() || (await this.offerRecord())) this.settle();
    } catch {
      this.settle();
      Kernel.logger.warn?.('OrbitDB record re-admission failed');
    }
  }

  public start(): void {
    this.arm();
  }

  /**
   * Offers the record unless it is settled or an offer is already running,
   * and waits for the offer it started at most `offerWaitMs`: an offer that
   * never resolves neither stalls the caller nor holds the record past its
   * last delay, and later callers do not wait on it again.
   */
  public offer(): Promise<void> {
    if (this.settled || this.inFlight) return Promise.resolve();

    const inFlight = this.attemptOffer().finally(() => {
      this.inFlight = undefined;
    });

    this.inFlight = inFlight;

    const { promise, resolve } = Promise.withResolvers<void>();
    const deadline = setTimeout(resolve, this.offerWaitMs);

    deadline.unref();
    void inFlight.finally(() => {
      clearTimeout(deadline);
      resolve();
    });

    return promise;
  }
}
