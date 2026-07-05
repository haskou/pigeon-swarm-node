import { NodeCallsRelayConfigurationResource } from './NodeCallsRelayConfigurationResource';
import { NodePrivateRelayConfigurationResource } from './NodePrivateRelayConfigurationResource';
import { NodePublicNetworkConfigurationResource } from './NodePublicNetworkConfigurationResource';

export type NodeRelayConfigurationResource = {
  callsRelay: NodeCallsRelayConfigurationResource;
  manualRelayMultiaddrs: string[];
  privateRelay: NodePrivateRelayConfigurationResource;
  publicHost?: string;
  publicNetwork: NodePublicNetworkConfigurationResource;
};
