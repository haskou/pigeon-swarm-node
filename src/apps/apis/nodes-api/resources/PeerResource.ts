import { NodeTypeResource } from './NodeTypeResource';
import { PeerCapabilitiesResource } from './PeerCapabilitiesResource';
import { PeerConnectionSummaryResource } from './PeerConnectionSummaryResource';

export type PeerResource = {
  capabilities: PeerCapabilitiesResource;
  connectionSummary: PeerConnectionSummaryResource;
  id: string;
  lastSeenAt: number;
  networks: Array<{
    id: string;
    name: string;
  }>;
  nodeType: NodeTypeResource;
  owner?: string;
};
