import { NodeNetworkCommunityStateStatus } from './NodeNetworkCommunityStateStatus';
import { NodeNetworkStoreSynchronizationStatus } from './NodeNetworkStoreSynchronizationStatus';
import { NodeNetworkSynchronizationState } from './NodeNetworkSynchronizationState';

export type NodeNetworkSynchronizationStatusPrimitives = {
  changedAt: number;
  networks: Array<{
    communityState: NodeNetworkCommunityStateStatus;
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
