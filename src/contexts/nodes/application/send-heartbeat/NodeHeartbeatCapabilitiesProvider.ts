import type { NodePeerCapabilitiesPrimitives } from '../../domain/NodePeerCapabilitiesPrimitives';

export interface NodeHeartbeatCapabilitiesProvider {
  find(): Promise<NodePeerCapabilitiesPrimitives>;
}
