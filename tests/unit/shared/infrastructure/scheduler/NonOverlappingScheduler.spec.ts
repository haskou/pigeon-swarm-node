jest.mock('@haskou/ddd-kernel', () => ({
  __esModule: true,
  default: {
    logger: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  },
}));

import { CronExpression } from '@haskou/ddd-kernel/scheduler';

import NonOverlappingScheduler from '../../../../../src/shared/infrastructure/scheduler/NonOverlappingScheduler';

class TestScheduler extends NonOverlappingScheduler {
  private executions = 0;

  private completeExecution!: () => void;

  public async execute(): Promise<void> {
    this.executions += 1;

    await new Promise<void>((resolve) => {
      this.completeExecution = resolve;
    });
  }

  public complete(): void {
    this.completeExecution();
  }

  public executionCount(): number {
    return this.executions;
  }

  public getCronExpression(): CronExpression {
    return {
      second: '*/5',
    };
  }

  public getProcessName(): string {
    return 'test-scheduler';
  }
}

describe('NonOverlappingScheduler', () => {
  it('should skip a run while the previous execution is still running', async () => {
    const scheduler = new TestScheduler();
    const firstRun = scheduler.runOnce();

    await Promise.resolve();
    await scheduler.runOnce();

    expect(scheduler.executionCount()).toBe(1);

    scheduler.complete();
    await firstRun;
    const nextRun = scheduler.runOnce();

    await Promise.resolve();
    expect(scheduler.executionCount()).toBe(2);

    scheduler.complete();
    await nextRun;
  });
});
