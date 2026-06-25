import type {
  Scheduler,
  SchedulerErrorPolicy,
} from '@haskou/ddd-kernel/scheduler';

import ReplicatedStateNotReadyError from '@app/contexts/shared/infrastructure/orbitdb/ReplicatedStateNotReadyError';
import Kernel from '@haskou/ddd-kernel';

export default class ReplicatedStateSchedulerErrorPolicy implements SchedulerErrorPolicy {
  public shouldSkip(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === ReplicatedStateNotReadyError.CODE
    );
  }

  public handle(error: unknown, scheduler: Scheduler): void {
    const errorMessage = error instanceof Error ? error.message : String(error);

    Kernel.logger?.error?.(
      `Error on ${scheduler.getProcessName()}: ${errorMessage}`,
    );
  }
}
