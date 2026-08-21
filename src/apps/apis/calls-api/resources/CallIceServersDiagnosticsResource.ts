export type CallIceServersDiagnosticsResource = {
  /**
   * True when CALLS_TURN_SHARED_SECRET is missing or equals the built-in
   * fallback. Credentials minted with the public fallback only work against
   * coturn instances using the same fallback, so cross-relay calls fail when
   * one pool member overrides it.
   */
  sharedSecretIsBuiltInFallback: boolean;
  /**
   * Where the advertised TURN URLs come from.
   */
  turnSource: 'connected-relay-record' | 'local-configuration' | 'none';
  /**
   * TURN URLs whose host is loopback, link-local, a private LAN address or a
   * zero-conf hostname. Clients connected through another relay node cannot
   * reach those hosts, so cross-relay media cannot select them as a relay
   * candidate pair.
   */
  unreachableTurnUrls: string[];
};
