import NodeHeartbeatSender from '@app/contexts/nodes/application/send-heartbeat/NodeHeartbeatSender';
import ReplicatedStateSchedulerErrorPolicy from '@app/shared/infrastructure/scheduler/ReplicatedStateSchedulerErrorPolicy';
import Scheduler from '@haskou/ddd-kernel/scheduler';
import { CronExpression } from '@haskou/ddd-kernel/scheduler';

export default class NodeHeartbeatScheduler extends Scheduler {
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
