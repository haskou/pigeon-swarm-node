import type { NodePeerCapabilitiesPrimitives } from '../../NodePeerCapabilitiesPrimitives';

export type NodeHeartbeatAttributes = {
  capabilities?: NodePeerCapabilitiesPrimitives;
  networks: Array<{ id: string; name: string }>;
  owner?: string;
};
