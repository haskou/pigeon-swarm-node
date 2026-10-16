import NodeBlockSourcesRefresher from '@app/contexts/nodes/application/refresh-block-sources/NodeBlockSourcesRefresher';
import ReplicatedStateSchedulerErrorPolicy from '@app/shared/infrastructure/scheduler/ReplicatedStateSchedulerErrorPolicy';
import Scheduler from '@haskou/ddd-kernel/scheduler';
import { CronExpression } from '@haskou/ddd-kernel/scheduler';
import { Timestamp } from '@haskou/value-objects';

/** Checks every minute for adopted block sources due by `NODE_BLOCK_SOURCE_FETCH_INTERVAL_MS`. */
export default class NodeBlockSourcesRefreshScheduler extends Scheduler {
  constructor(private readonly refresher: NodeBlockSourcesRefresher) {
    super(new ReplicatedStateSchedulerErrorPolicy());
  }

  public async execute(): Promise<void> {
    await this.refresher.refresh(Timestamp.now());
  }

  public getCronExpression(): CronExpression {
    return { second: 20 };
  }

  public getProcessName(): string {
    return 'node-block-sources-refresh';
  }
}
