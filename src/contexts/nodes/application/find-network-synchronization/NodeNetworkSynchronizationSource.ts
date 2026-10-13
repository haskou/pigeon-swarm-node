import { NodeNetworkSynchronizationStoreSource } from './NodeNetworkSynchronizationStoreSource';

export type NodeNetworkSynchronizationSource = {
  getConnectedPeerIds(): string[];
  id: string;
  isPrivate: boolean;
  /** This node's libp2p peer id on the network. */
  localPeerId: string;
  name: string;
  onPeerConnected(listener: () => void): void;
  onPeerDisconnected(listener: () => void): void;
  stores: NodeNetworkSynchronizationStoreSource[];
  type: string;
};
