export type PublicRelayDebugState = {
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
    lastDiscoveredAt?: number;
    lastError?: string;
    lastLookupHadValue?: boolean;
    lastLookupValueKind?: 'cid' | 'inline-envelope' | 'provider' | 'unknown';
    lastPublishedAt?: number;
    lastPublishedNetworkCount?: number;
    lastRequestedNetworkCount?: number;
    privateNetworkCount: number;
    privateNetworkFingerprints: string[];
  };
  relayAutoEnabled: boolean;
  relayAdvertised: boolean;
  relayEnabled: boolean;
  relayRecord?: {
    expiresAt: number;
    issuedAt: number;
    multiaddrs: string[];
    peerId: string;
    publicKey: string;
    role: 'relay';
    signature: string;
    version: 1;
  };
  running: boolean;
};
