import { NodeCallsRelayConfigurationResource } from './NodeCallsRelayConfigurationResource';
import { NodePrivateRelayConfigurationResource } from './NodePrivateRelayConfigurationResource';
import { NodePublicRelayConfigurationResource } from './NodePublicRelayConfigurationResource';

export type NodeRelayConfigurationResource = {
  callsRelay: NodeCallsRelayConfigurationResource;
  manualRelayMultiaddrs: string[];
  privateRelay: NodePrivateRelayConfigurationResource;
  publicHost?: string;
  publicRelay: NodePublicRelayConfigurationResource;
};
