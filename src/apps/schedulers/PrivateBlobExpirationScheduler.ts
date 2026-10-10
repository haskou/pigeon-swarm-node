import PrivateBlobExpirer from '@app/contexts/private-blobs/application/PrivateBlobExpirer';
import ReplicatedStateSchedulerErrorPolicy from '@app/shared/infrastructure/scheduler/ReplicatedStateSchedulerErrorPolicy';
import Scheduler from '@haskou/ddd-kernel/scheduler';
import { CronExpression } from '@haskou/ddd-kernel/scheduler';

export default class PrivateBlobExpirationScheduler extends Scheduler {
  constructor(private readonly expirer: PrivateBlobExpirer) {
    super(new ReplicatedStateSchedulerErrorPolicy());
  }

  public async execute(): Promise<void> {
    await this.expirer.expire(Date.now());
  }

  public getCronExpression(): CronExpression {
    return { minute: '*/5', second: 20 };
  }

  public getProcessName(): string {
    return 'private-blob-expiration';
  }
}
