import DeviceSealingRecordPruner from '@app/contexts/identity-devices/application/prune/DeviceSealingRecordPruner';
import { Runtime } from '@app/shared/infrastructure/lifecycle/Runtime';
import { errorClassName } from '@app/shared/infrastructure/logs/ErrorClassName';
import Kernel from '@haskou/ddd-kernel';

/**
 * Prunes device sealing records right after start, off the start path, and
 * then every hour, so held records stay bounded to today and yesterday (UTC).
 */
export default class DeviceSealingRecordPruningRuntime implements Runtime {
  private static readonly PRUNE_INTERVAL_MS = 3_600_000;

  private pruneTimeout?: NodeJS.Timeout;

  constructor(private readonly pruner: DeviceSealingRecordPruner) {}

  private scheduleNextPrune(delayMs: number): void {
    this.pruneTimeout = setTimeout(() => {
      void this.prune();
    }, delayMs);
    this.pruneTimeout.unref?.();
  }

  private async prune(): Promise<void> {
    try {
      await this.pruner.prune(new Date(Date.now()));
    } catch (error: unknown) {
      Kernel.logger.warn(
        `Device sealing record pruning failed: error=${errorClassName(error)}`,
      );
    } finally {
      this.scheduleNextPrune(
        DeviceSealingRecordPruningRuntime.PRUNE_INTERVAL_MS,
      );
    }
  }

  public run(): Promise<void> {
    if (!this.pruneTimeout) {
      this.scheduleNextPrune(0);
    }

    return Promise.resolve();
  }
}
