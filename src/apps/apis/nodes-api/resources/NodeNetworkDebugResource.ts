export type NodeNetworkDebugResource = {
  ipfsNetworks: Array<{
    id: string;
    name: string;
    peerCount: number;
    peerId?: string;
    peers?: string[];
    type: 'private' | 'public';
  }>;
  publicRelay: {
    advertisedAddresses?: string[];
    bootstrapRelayCount: number;
    bootstrapRelayMultiaddrs?: string[];
    debugReason: string;
    discoveryEnabled: boolean;
    discoveredRelayCount: number;
    discoveredRelayMultiaddrs?: string[];
    exposeSensitiveDebug: boolean;
    fallbackRelayCount: number;
    fallbackRelayMultiaddrs?: string[];
    listenAddresses?: string[];
    listenAddressCount: number;
    peerId?: string;
    privateRelayDirectory: {
      discoveredRecordCount: number;
      discoveredRelayPeerIds?: string[];
      lastDiscoveredAt?: number;
      lastError?: string;
      lastIPNSDocumentEncryptedRecordCount?: number;
      lastIPNSDocumentOpenedRecordCount?: number;
      lastIPNSName?: string;
      lastIPNSPublishedAt?: number;
      lastIPNSRejectedReason?: string;
      lastIPNSResolvedAt?: number;
      lastIPNSValue?: string;
      lastLookupHadValue?: boolean;
      lastLookupValueKind?:
        | 'cid'
        | 'inline-envelope'
        | 'ipns'
        | 'provider'
        | 'unknown';
      lastPublishedAt?: number;
      lastPublishedNetworkCount?: number;
      lastProviderLookupAt?: number;
      lastProviderLookupHadValue?: boolean;
      lastProviderLookupMultiaddrs?: string[];
      lastProviderLookupMultiaddrCount?: number;
      lastPubSubPublishedAt?: number;
      lastPubSubReceivedAt?: number;
      lastRequestedNetworkCount?: number;
      publicConnectionPeerCount?: number;
      publicConnectionPeerId?: string;
      privateNetworkCount: number;
      privateNetworkFingerprints?: string[];
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
};
