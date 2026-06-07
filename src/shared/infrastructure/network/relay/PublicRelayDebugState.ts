export type PublicRelayDebugState = {
  advertisedAddresses: string[];
  bootstrapRelayMultiaddrs: string[];
  debugReason: string;
  discoveryEnabled: boolean;
  discoveredRelayCount: number;
  discoveredRelayMultiaddrs: string[];
  listenAddresses: string[];
  peerId?: string;
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
