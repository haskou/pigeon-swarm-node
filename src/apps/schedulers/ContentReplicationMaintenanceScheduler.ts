import ContentReplicationMaintainer from '@app/contexts/content-replication/application/maintain/ContentReplicationMaintainer';
import ReplicatedStateSchedulerErrorPolicy from '@app/shared/infrastructure/scheduler/ReplicatedStateSchedulerErrorPolicy';
import Kernel from '@haskou/ddd-kernel';
import Scheduler from '@haskou/ddd-kernel/scheduler';
import { CronExpression } from '@haskou/ddd-kernel/scheduler';

export default class ContentReplicationMaintenanceScheduler extends Scheduler {
  constructor(private readonly maintainer: ContentReplicationMaintainer) {
    super(new ReplicatedStateSchedulerErrorPolicy());
  }

  public async execute(): Promise<void> {
    const result = await this.maintainer.maintain();
    const message = [
      `Maintained content replication: maintained=${result.maintainedReplicas}`,
      `failed=${result.failedReplicas}`,
    ].join(', ');

    if (result.failedReplicas > 0) {
      Kernel.logger.warn(message);

      return;
    }

    Kernel.logger.debug?.(message);
  }

  public getCronExpression(): CronExpression {
    return {
      minute: '*/10',
      second: 45,
    };
  }

  public getProcessName(): string {
    return 'content-replication-maintenance';
  }
}
