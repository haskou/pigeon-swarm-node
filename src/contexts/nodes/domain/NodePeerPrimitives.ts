import { PrimitiveOf } from '@haskou/value-objects';

import { NodePeerCapabilitiesPrimitives } from './NodePeerCapabilitiesPrimitives';
import { NodePeerNetwork } from './NodePeerNetwork';

export type NodePeerPrimitives = {
  capabilities?: Partial<NodePeerCapabilitiesPrimitives>;
  id: string;
  lastSeenAt: number;
  networks: Array<PrimitiveOf<NodePeerNetwork>>;
  owner?: string;
};
