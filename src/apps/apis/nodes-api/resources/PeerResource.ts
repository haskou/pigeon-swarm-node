import { PeerCapabilitiesResource } from './PeerCapabilitiesResource';
import { PeerConnectionSummaryResource } from './PeerConnectionSummaryResource';
import { PeerNetworkResource } from './PeerNetworkResource';
import { PeerNodeTypeResource } from './PeerNodeTypeResource';

export type PeerResource = {
  capabilities?: PeerCapabilitiesResource;
  connectionSummary?: PeerConnectionSummaryResource;
  id: string;
  lastSeenAt: number;
  networks: PeerNetworkResource[];
  nodeType?: PeerNodeTypeResource;
  owner?: string;
};
