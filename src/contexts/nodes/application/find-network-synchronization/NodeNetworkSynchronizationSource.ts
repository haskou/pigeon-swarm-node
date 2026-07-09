import { NodeNetworkSynchronizationStoreSource } from './NodeNetworkSynchronizationStoreSource';

export type NodeNetworkSynchronizationSource = {
  getConnectedPeerIds(): string[];
  id: string;
  isPrivate: boolean;
  name: string;
  onPeerConnected(listener: () => void): void;
  onPeerDisconnected(listener: () => void): void;
  stores: NodeNetworkSynchronizationStoreSource[];
  type: string;
};
