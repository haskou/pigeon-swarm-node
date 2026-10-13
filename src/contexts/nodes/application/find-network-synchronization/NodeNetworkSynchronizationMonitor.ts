import { NodeCommunityStateDigest } from '../../domain/value-objects/NodeCommunityStateDigest';
import { NodeNetworkSynchronizationSource } from './NodeNetworkSynchronizationSource';
import { NodeNetworkSynchronizationStatus } from './NodeNetworkSynchronizationStatus';

export default abstract class NodeNetworkSynchronizationMonitor {
  public abstract observe(source: NodeNetworkSynchronizationSource): void;

  public abstract remove(networkId: string): void;

  public abstract read(): NodeNetworkSynchronizationStatus;

  public abstract onChanged(
    listener: (status: NodeNetworkSynchronizationStatus) => void,
  ): void;

  public abstract observedNetworks(): Array<{
    id: string;
    localPeerId: string;
  }>;

  public abstract recordLocalCommunityState(
    networkId: string,
    digest: NodeCommunityStateDigest,
  ): void;

  public abstract recordPeerCommunityState(
    networkId: string,
    peerId: string,
    digest: NodeCommunityStateDigest,
  ): void;
}
