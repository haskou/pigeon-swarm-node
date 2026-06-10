import NodeStartupSynchronizer from '@app/apps/synchronizers/NodeStartupSynchronizer';
import Kernel from '@app/Kernel';

export default class NodeStartupSyncRuntime {
  constructor(private readonly synchronizer: NodeStartupSynchronizer) {}

  public async run(): Promise<void> {
    const result = await this.synchronizer.synchronize();

    Kernel.logger.info(`Node startup sync result: ${JSON.stringify(result)}`);
    this.synchronizer.scheduleRetries();
  }
}
