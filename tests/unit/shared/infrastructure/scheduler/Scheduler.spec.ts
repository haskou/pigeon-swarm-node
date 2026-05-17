import Kernel from '@app/Kernel';
import Scheduler from '@app/shared/infrastructure/scheduler/Scheduler';
import { CronExpression } from '@app/shared/infrastructure/scheduler/SchedulerCronExpression';
import cron from 'node-cron';

jest.mock('node-cron', () => ({
  __esModule: true,
  default: {
    schedule: jest.fn(),
  },
}));

class TestScheduler extends Scheduler {
  constructor(private readonly executeCallback: () => Promise<void>) {
    super();
  }

  public async execute(): Promise<void> {
    await this.executeCallback();
  }

  public getProcessName(): string {
    return 'test-scheduler';
  }

  public getCronExpression(): CronExpression {
    return {
      second: '*/5',
    };
  }
}

describe('Scheduler', () => {
  const logger = {
    debug: jest.fn(),
    error: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (Kernel as unknown as { _logs: typeof logger })._logs = logger;
  });

  it('logs scheduled execution errors without throwing from the cron callback', async () => {
    let cronCallback: (() => Promise<void>) | undefined;

    jest.mocked(cron.schedule).mockImplementation((_expression, callback) => {
      cronCallback = callback as () => Promise<void>;

      return undefined as never;
    });

    await new TestScheduler(async () => {
      throw new Error('boom');
    }).init();

    await expect(cronCallback?.()).resolves.toBeUndefined();
    expect(logger.debug).toHaveBeenCalledWith(
      'Scheduler: Executing test-scheduler',
    );
    expect(logger.error).toHaveBeenCalledWith(
      'Error on test-scheduler: boom',
    );
  });
});
