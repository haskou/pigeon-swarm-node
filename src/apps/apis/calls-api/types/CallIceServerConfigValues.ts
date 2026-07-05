export type CallIceServerConfigValues = {
  iceTransportPolicy: 'all' | 'relay';
  iceTransportPolicyConfigured: boolean;
  stunUrls: string[];
  turnCredential: string | undefined;
  turnCredentialTtlSeconds: number;
  turnDiscoveryEnabled: boolean;
  turnSharedSecret: string | undefined;
  turnUrls: string[];
  turnUsername: string | undefined;
};
