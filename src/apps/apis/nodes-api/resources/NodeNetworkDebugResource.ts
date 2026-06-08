export type NodeNetworkDebugResource = {
  publicRelay: {
    advertisedAddresses: string[];
    bootstrapRelayMultiaddrs: string[];
    debugReason: string;
    discoveryEnabled: boolean;
    discoveredRelayCount: number;
    discoveredRelayMultiaddrs: string[];
    listenAddresses: string[];
    peerId?: string;
    privateRelayDirectory: {
      discoveredRecordCount: number;
      discoveredRelayPeerIds: string[];
      privateNetworkCount: number;
      privateNetworkFingerprints: string[];
    };
    relayAutoEnabled: boolean;
    relayAdvertised: boolean;
    relayEnabled: boolean;
    running: boolean;
  };
};
