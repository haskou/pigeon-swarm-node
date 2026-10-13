import NodeNetworkSynchronizationMonitor from '../find-network-synchronization/NodeNetworkSynchronizationMonitor';
import { NodePeerCommunityStateRecordMessage } from './messages/NodePeerCommunityStateRecordMessage';

export default class NodePeerCommunityStateRecorder {
  constructor(private readonly monitor: NodeNetworkSynchronizationMonitor) {}

  public record(message: NodePeerCommunityStateRecordMessage): void {
    this.monitor.recordPeerCommunityState(
      message.networkId.valueOf(),
      message.peerId,
      message.digest,
    );
  }
}
