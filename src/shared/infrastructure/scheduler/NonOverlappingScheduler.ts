import Kernel from '@haskou/ddd-kernel';
import Scheduler, { SchedulerErrorPolicy } from '@haskou/ddd-kernel/scheduler';

export default abstract class NonOverlappingScheduler extends Scheduler {
  private running = false;

  constructor(errorPolicy?: SchedulerErrorPolicy) {
    super(errorPolicy);
  }

  public async runOnce(): Promise<void> {
    if (this.running) {
      Kernel.logger?.debug?.(
        `Scheduler: Skipping ${this.getProcessName()} because the previous execution is still running`,
      );

      return;
    }

    this.running = true;

    try {
      await super.runOnce();
    } finally {
      this.running = false;
    }
  }
}
