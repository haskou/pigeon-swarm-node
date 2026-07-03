import NodeHeartbeatSender from '@app/contexts/nodes/application/send-heartbeat/NodeHeartbeatSender';
import NonOverlappingScheduler from '@app/shared/infrastructure/scheduler/NonOverlappingScheduler';
import ReplicatedStateSchedulerErrorPolicy from '@app/shared/infrastructure/scheduler/ReplicatedStateSchedulerErrorPolicy';
import { CronExpression } from '@haskou/ddd-kernel/scheduler';

export default class NodeHeartbeatScheduler extends NonOverlappingScheduler {
  constructor(private readonly sender: NodeHeartbeatSender) {
    super(new ReplicatedStateSchedulerErrorPolicy());
  }

  public async execute(): Promise<void> {
    await this.sender.send();
  }

  public getProcessName(): string {
    return 'node-heartbeat';
  }

  public getCronExpression(): CronExpression {
    return {
      minute: '*/5',
      second: 0,
    };
  }
}
