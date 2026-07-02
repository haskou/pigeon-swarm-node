import { NodePeerNetworkPrimitives } from './NodePeerNetworkPrimitives';

export type NodePeerPrimitives = {
  id: string;
  lastSeenAt: number;
  networks: NodePeerNetworkPrimitives[];
  owner?: string;
};
