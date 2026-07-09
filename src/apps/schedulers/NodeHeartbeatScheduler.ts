import NodeHeartbeatSender from '@app/contexts/nodes/application/send-heartbeat/NodeHeartbeatSender';
import ObservedScheduler from '@app/shared/infrastructure/scheduler/ObservedScheduler';
import ReplicatedStateSchedulerErrorPolicy from '@app/shared/infrastructure/scheduler/ReplicatedStateSchedulerErrorPolicy';
import { CronExpression } from '@haskou/ddd-kernel/scheduler';

export default class NodeHeartbeatScheduler extends ObservedScheduler {
  constructor(private readonly sender: NodeHeartbeatSender) {
    super(new ReplicatedStateSchedulerErrorPolicy());
  }

  protected async executeObserved(): Promise<void> {
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
