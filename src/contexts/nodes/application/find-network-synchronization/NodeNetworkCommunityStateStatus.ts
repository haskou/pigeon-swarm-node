import { NodeNetworkCommunityState } from './NodeNetworkCommunityState';

export type NodeNetworkCommunityStateStatus = {
  peers: Array<{ peerId: string; state: NodeNetworkCommunityState }>;
  state: NodeNetworkCommunityState;
};
