import type {
  Scheduler,
  SchedulerErrorPolicy,
} from '@haskou/ddd-kernel/scheduler';

import ReplicatedStateNotReadyError from '@app/contexts/shared/infrastructure/orbitdb/ReplicatedStateNotReadyError';
import { errorClassName } from '@app/shared/infrastructure/logs/ErrorClassName';
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

  /**
   * Logs only the process name and the error class: exception messages can
   * carry identity ids and other private data.
   */
  public handle(error: unknown, scheduler: Scheduler): void {
    Kernel.logger?.error?.(
      `Error on ${scheduler.getProcessName()}: error=${errorClassName(error)}`,
    );
  }
}
