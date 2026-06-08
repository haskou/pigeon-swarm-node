import IPFSReplicationStatusFinder from '@app/contexts/ipfs-replication/application/find-status/IPFSReplicationStatusFinder';
import IPFSReplicationMaintainer from '@app/contexts/ipfs-replication/application/maintain/IPFSReplicationMaintainer';
import IPFSReplicationStatusSummaryUpdater from '@app/contexts/ipfs-replication/application/update-status-summary/IPFSReplicationStatusSummaryUpdater';
import MongoIPFSContentReplicaClaimRepository from '@app/contexts/ipfs-replication/infrastructure/mongo/MongoIPFSContentReplicaClaimRepository';
import MongoIPFSContentReplicationRepository from '@app/contexts/ipfs-replication/infrastructure/mongo/MongoIPFSContentReplicationRepository';
import MongoIPFSReplicationStatusSummaryRepository from '@app/contexts/ipfs-replication/infrastructure/mongo/MongoIPFSReplicationStatusSummaryRepository';
import MongoNodeMetadataRepository from '@app/contexts/nodes/infrastructure/mongo/MongoNodeMetadataRepository';
import MongoNodePeerRepository from '@app/contexts/nodes/infrastructure/mongo/MongoNodePeerRepository';
import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';
import Kernel from '@app/Kernel';
import MessageBus from '@app/shared/infrastructure/messageBus/MessageBus';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
import Scheduler from '@app/shared/infrastructure/scheduler/Scheduler';
import { CronExpression } from '@app/shared/infrastructure/scheduler/SchedulerCronExpression';

export default class IPFSReplicationMaintenanceScheduler extends Scheduler {
  private maintainer(): IPFSReplicationMaintainer {
    const mongo = this.get<MongoDB>(MongoDB);
    const claimRepository = new MongoIPFSContentReplicaClaimRepository(mongo);

    return new IPFSReplicationMaintainer(
      new IPFSReplicationStatusFinder(
        new MongoIPFSContentReplicationRepository(mongo),
        claimRepository,
        this.get<MongoNodeMetadataRepository>(MongoNodeMetadataRepository),
        new MongoNodePeerRepository(mongo),
      ),
      claimRepository,
      this.get<IPFS>(IPFS),
      this.get<MessageBus>(MessageBus),
      new IPFSReplicationStatusSummaryUpdater(
        new MongoIPFSReplicationStatusSummaryRepository(mongo),
      ),
    );
  }

  public async execute(): Promise<void> {
    const result = await this.maintainer().maintain();
    const hasFailures = result.failedClaims > 0 || result.failedReleases > 0;
    const hasChanges =
      result.claimedReplicas > 0 || result.releasedReplicas > 0;
    const message = `IPFS replication: claimed=${result.claimedReplicas}, released=${result.releasedReplicas}, failedClaims=${result.failedClaims}, failedReleases=${result.failedReleases}`;

    if (hasFailures) {
      Kernel.logger.warn(message);

      return;
    }

    if (hasChanges) {
      Kernel.logger.info(message);

      return;
    }

    Kernel.logger.debug(message);
  }

  public scheduleWarmupRuns(delaysMs: number[] = [30000, 90000, 300000]): void {
    for (const delayMs of delaysMs) {
      const timer = setTimeout(() => {
        void this.execute().catch((error: unknown) => {
          const errorMessage =
            error instanceof Error ? error.message : String(error);

          Kernel.logger.error(
            `Error on ${this.getProcessName()} warmup: ${errorMessage}`,
          );
        });
      }, delayMs);

      timer.unref?.();
    }
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
