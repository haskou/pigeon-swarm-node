import ContentReplicationMaintainer from '@app/contexts/content-replication/application/maintain/ContentReplicationMaintainer';
import Kernel from '@app/Kernel';
import Scheduler from '@app/shared/infrastructure/scheduler/Scheduler';
import { CronExpression } from '@app/shared/infrastructure/scheduler/SchedulerCronExpression';

export default class ContentReplicationMaintenanceScheduler extends Scheduler {
  constructor(private readonly maintainer: ContentReplicationMaintainer) {
    super();
  }

  public async execute(): Promise<void> {
    const result = await this.maintainer.maintain();
    const message = [
      `Maintained content replication: claimed=${result.claimedReplicas}`,
      `released=${result.releasedReplicas}`,
      `failedClaims=${result.failedClaims}`,
      `failedReleases=${result.failedReleases}`,
    ].join(', ');

    if (result.failedClaims > 0 || result.failedReleases > 0) {
      Kernel.logger.warn(message);

      return;
    }

    if (result.claimedReplicas > 0 || result.releasedReplicas > 0) {
      Kernel.logger.info(message);

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
