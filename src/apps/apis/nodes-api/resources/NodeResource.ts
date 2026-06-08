import { NodeNetworkSummaryResource } from './NodeNetworkSummaryResource';
import { NodeRelayResource } from './NodeRelayResource';
import { NodeRuntimeResource } from './NodeRuntimeResource';
import { NodeTypeResource } from './NodeTypeResource';

export type NodeResource = {
  id: string;
  networkSummary: NodeNetworkSummaryResource;
  nodeType: NodeTypeResource;
  owner?: string;
  relay: NodeRelayResource;
  runtime: NodeRuntimeResource;
};
