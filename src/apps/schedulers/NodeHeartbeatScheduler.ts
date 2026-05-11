import NodeHeartbeatSender from '@app/contexts/nodes/application/send-heartbeat/NodeHeartbeatSender';
import Scheduler from '@app/shared/infrastructure/scheduler/Scheduler';
import { CronExpression } from '@app/shared/infrastructure/scheduler/SchedulerCronExpression';

export default class NodeHeartbeatScheduler extends Scheduler {
  private readonly sender: NodeHeartbeatSender =
    this.get<NodeHeartbeatSender>(NodeHeartbeatSender);

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
