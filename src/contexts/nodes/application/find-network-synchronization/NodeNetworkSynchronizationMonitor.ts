import { NodeNetworkSynchronizationSource } from './NodeNetworkSynchronizationSource';
import { NodeNetworkSynchronizationStatus } from './NodeNetworkSynchronizationStatus';

export default abstract class NodeNetworkSynchronizationMonitor {
  public abstract observe(source: NodeNetworkSynchronizationSource): void;

  public abstract remove(networkId: string): void;

  public abstract read(): NodeNetworkSynchronizationStatus;

  public abstract onChanged(
    listener: (status: NodeNetworkSynchronizationStatus) => void,
  ): void;
}
