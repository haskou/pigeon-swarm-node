export type CallIceServersDiagnosticsResource = {
  /**
   * Whether a private TURN shared secret is configured. Missing secrets and the
   * former public fallback disable shared-secret credential issuance.
   * Explicit local static credentials may still be used when this is false.
   */
  turnSharedSecretConfigured: boolean;
  /**
   * Source of candidate TURN URLs, even when credentials are unavailable.
   */
  turnSource: 'connected-relay-record' | 'local-configuration' | 'none';
  /**
   * Static hints for loopback, link-local, private IP and zero-conf hosts.
   * These are not reachability checks: private hosts may work over LAN or VPN,
   * and public hosts may still be unreachable or reject credentials.
   */
  nonPublicTurnUrls: string[];
};
