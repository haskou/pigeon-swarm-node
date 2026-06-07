export type NodeNetworkDebugResource = {
  publicRelay: {
    advertisedAddresses: string[];
    bootstrapRelayMultiaddrs: string[];
    debugReason: string;
    discoveryEnabled: boolean;
    listenAddresses: string[];
    peerId?: string;
    relayAdvertised: boolean;
    relayEnabled: boolean;
    running: boolean;
  };
};
