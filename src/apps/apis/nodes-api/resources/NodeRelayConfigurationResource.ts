import { NodeCallsRelayConfigurationResource } from './NodeCallsRelayConfigurationResource';
import { NodePrivateRelayConfigurationResource } from './NodePrivateRelayConfigurationResource';

export type NodeRelayConfigurationResource = {
  callsRelay: NodeCallsRelayConfigurationResource;
  manualRelayMultiaddrs: string[];
  privateRelay: NodePrivateRelayConfigurationResource;
  publicHost?: string;
};
