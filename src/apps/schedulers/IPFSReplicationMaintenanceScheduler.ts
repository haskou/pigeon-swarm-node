import IPFSReplicationStatusFinder from '@app/contexts/ipfs-replication/application/find-status/IPFSReplicationStatusFinder';
import IPFSReplicationMaintainer from '@app/contexts/ipfs-replication/application/maintain/IPFSReplicationMaintainer';
import MongoIPFSContentReplicaClaimRepository from '@app/contexts/ipfs-replication/infrastructure/mongo/MongoIPFSContentReplicaClaimRepository';
import MongoIPFSContentReplicationRepository from '@app/contexts/ipfs-replication/infrastructure/mongo/MongoIPFSContentReplicationRepository';
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
    );
  }

  public async execute(): Promise<void> {
    const result = await this.maintainer().maintain();

    Kernel.logger.info(
      `Maintained IPFS replication: claimed=${result.claimedReplicas}, released=${result.releasedReplicas}`,
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
