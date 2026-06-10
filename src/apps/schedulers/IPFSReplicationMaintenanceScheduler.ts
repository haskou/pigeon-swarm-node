import IPFSReplicationMaintainer from '@app/contexts/ipfs-replication/application/maintain/IPFSReplicationMaintainer';
import Kernel from '@app/Kernel';
import Scheduler from '@app/shared/infrastructure/scheduler/Scheduler';
import { CronExpression } from '@app/shared/infrastructure/scheduler/SchedulerCronExpression';

export default class IPFSReplicationMaintenanceScheduler extends Scheduler {
  constructor(private readonly maintainer: IPFSReplicationMaintainer) {
    super();
  }

  public async execute(): Promise<void> {
    const result = await this.maintainer.maintain();

    Kernel.logger.info(
      `Maintained IPFS replication: claimed=${result.claimedReplicas}, released=${result.releasedReplicas}, failedClaims=${result.failedClaims}, failedReleases=${result.failedReleases}`,
    );
  }

  public getCronExpression(): CronExpression {
    return {
      minute: '*/10',
      second: 45,
    };
  }

  public getProcessName(): string {
    return 'ipfs-replication-maintenance';
  }
}
