import ContentReplicationMaintainer from '@app/contexts/content-replication/application/maintain/ContentReplicationMaintainer';
import NonOverlappingScheduler from '@app/shared/infrastructure/scheduler/NonOverlappingScheduler';
import ReplicatedStateSchedulerErrorPolicy from '@app/shared/infrastructure/scheduler/ReplicatedStateSchedulerErrorPolicy';
import Kernel from '@haskou/ddd-kernel';
import { CronExpression } from '@haskou/ddd-kernel/scheduler';

export default class ContentReplicationMaintenanceScheduler extends NonOverlappingScheduler {
  constructor(private readonly maintainer: ContentReplicationMaintainer) {
    super(new ReplicatedStateSchedulerErrorPolicy());
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
