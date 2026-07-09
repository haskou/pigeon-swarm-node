import NodeNetworkSynchronizationMonitor from './NodeNetworkSynchronizationMonitor';
import { NodeNetworkSynchronizationStatus } from './NodeNetworkSynchronizationStatus';

export default class NodeNetworkSynchronizationFinder {
  public constructor(
    private readonly monitor: NodeNetworkSynchronizationMonitor,
  ) {}

  public find(): NodeNetworkSynchronizationStatus {
    return this.monitor.read();
  }
}
