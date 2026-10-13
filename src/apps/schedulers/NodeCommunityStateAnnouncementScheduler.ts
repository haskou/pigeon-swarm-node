import NodeCommunityStateAnnouncer from '@app/contexts/nodes/application/announce-community-state/NodeCommunityStateAnnouncer';
import ReplicatedStateSchedulerErrorPolicy from '@app/shared/infrastructure/scheduler/ReplicatedStateSchedulerErrorPolicy';
import Scheduler from '@haskou/ddd-kernel/scheduler';
import { CronExpression } from '@haskou/ddd-kernel/scheduler';

export default class NodeCommunityStateAnnouncementScheduler extends Scheduler {
  constructor(private readonly announcer: NodeCommunityStateAnnouncer) {
    super(new ReplicatedStateSchedulerErrorPolicy());
  }

  public async execute(): Promise<void> {
    await this.announcer.announce();
  }

  public getProcessName(): string {
    return 'node-community-state-announcement';
  }

  public getCronExpression(): CronExpression {
    return {
      second: '*/10',
    };
  }
}
