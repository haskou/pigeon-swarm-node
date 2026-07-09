import Kernel from '@haskou/ddd-kernel';
import Scheduler from '@haskou/ddd-kernel/scheduler';
import { SchedulerErrorPolicy } from '@haskou/ddd-kernel/scheduler';

import { pigeonEnvironment } from '../environment/PigeonEnvironment';

export default abstract class ObservedScheduler extends Scheduler {
  protected constructor(errorPolicy: SchedulerErrorPolicy) {
    super(errorPolicy);
  }

  private stuckWarningTimeoutMs(): number {
    return pigeonEnvironment().PIGEON_SCHEDULER_STUCK_WARNING_MS;
  }

  protected abstract executeObserved(): Promise<void>;

  public async execute(): Promise<void> {
    const processName = this.getProcessName();
    const startedAt = Date.now();
    let finished = false;
    const warningTimeout = setTimeout(() => {
      if (finished) {
        return;
      }

      Kernel.logger.warn?.(
        `Scheduler still running: process=${processName} durationMs=${Date.now() - startedAt}`,
      );
    }, this.stuckWarningTimeoutMs());

    warningTimeout.unref?.();
    Kernel.logger.debug?.(`Scheduler started: process=${processName}`);

    try {
      await this.executeObserved();
      Kernel.logger.debug?.(
        `Scheduler finished: process=${processName} durationMs=${Date.now() - startedAt}`,
      );
    } catch (error) {
      Kernel.logger.warn?.(
        `Scheduler failed: process=${processName} durationMs=${Date.now() - startedAt} error=${String(error)}`,
      );
      throw error;
    } finally {
      finished = true;
      clearTimeout(warningTimeout);
    }
  }
}
