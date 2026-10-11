/** Express `trust proxy` value: `false` keeps the socket address. */
export type TrustProxySetting = false | 'loopback' | number;

/**
 * Operator opt-in for forwarded client addresses (`API_TRUST_PROXY`). The
 * default `false` keeps the socket address, so a client cannot choose its own
 * rate-limit key. `true` is refused because it would let any client set
 * X-Forwarded-For. A bad value fails at boot rather than running open.
 */
export function parseTrustProxySetting(raw: string): TrustProxySetting {
  const value = raw.trim().toLowerCase();

  if (value === '' || value === 'false') {
    return false;
  }

  if (value === 'loopback') {
    return 'loopback';
  }

  if (/^[1-9]\d{0,2}$/.test(value)) {
    return Number(value);
  }

  throw new Error(
    `API_TRUST_PROXY must be "false", "loopback", or a proxy hop count from 1 to 999; got "${raw}".`,
  );
}
