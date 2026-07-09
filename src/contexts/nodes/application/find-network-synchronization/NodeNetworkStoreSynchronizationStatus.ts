import { NodeNetworkSynchronizationState } from './NodeNetworkSynchronizationState';

export type NodeNetworkStoreSynchronizationStatus = {
  name: string;
  peerIds: string[];
  state: NodeNetworkSynchronizationState;
};
