export type PublicRelayConfigurationOptions = {
  bootstrapRelayMultiaddrs: string[];
  libp2pPort: number;
  publicHost: string | undefined;
  relayAutoEnabled: boolean;
  relayDiscoveryEnabled: boolean;
  relayEnabled: boolean;
  relayPort: number;
  relayRecordTtlSeconds: number;
};
