import cron from 'node-cron';
import Kernel from '@app/Kernel';
import { CronExpression } from './SchedulerCronExpression';
import InvalidParseCronExpressionError from '../errors/scheduler/InvalidParseCronExpressionError';
import ScheduledExecutionError from '../errors/scheduler/ScheduledExecutionError';

export default abstract class Scheduler {
  public abstract execute(): Promise<void>;
  public abstract getProcessName(): string;
  public abstract getCronExpression(): CronExpression;

  public get<T>(service: unknown): T {
    return Kernel.di.getService<T>(service);
  }

  public async init(): Promise<void> {
    let parsedCronExpression: string;
    try {
      parsedCronExpression = this.parseCronExpression();
    } catch (err) {
      throw new InvalidParseCronExpressionError(this.getProcessName());
    }
    cron.schedule(parsedCronExpression, async () => {
      try {
        Kernel.logger.info(`Scheduler: Executing ${this.getProcessName()}`);
        await this.execute();
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        throw new ScheduledExecutionError(
          `Error on ${this.getProcessName()}: ${errorMessage}`,
        );
      }
    });
  }

  private parseCronExpression(): string {
    const expression = this.getCronExpression();

    return (
      '' +
      `${expression.second ?? '*'} ` +
      `${expression.minute ?? '*'} ` +
      `${expression.hour ?? '*'} ` +
      `${expression.dayOfMonth ?? '*'} ` +
      `${expression.month ?? '*'} ` +
      `${expression.dayOfWeek ?? '*'}`
    );
  }
}
