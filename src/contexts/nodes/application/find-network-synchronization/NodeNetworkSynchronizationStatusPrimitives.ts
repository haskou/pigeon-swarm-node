import { NodeNetworkStoreSynchronizationStatus } from './NodeNetworkStoreSynchronizationStatus';
import { NodeNetworkSynchronizationState } from './NodeNetworkSynchronizationState';

export type NodeNetworkSynchronizationStatusPrimitives = {
  changedAt: number;
  networks: Array<{
    connectedPeerIds: string[];
    convergedStoreCount: number;
    id: string;
    name: string;
    replicationPeerIds: string[];
    state: NodeNetworkSynchronizationState;
    stores: NodeNetworkStoreSynchronizationStatus[];
    totalStoreCount: number;
    type: string;
  }>;
};
