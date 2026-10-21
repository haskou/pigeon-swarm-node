import { DeviceAuthorizationRateLimiter } from './DeviceAuthorizationRateLimiter';

/**
 * Bounds unauthenticated transition submissions before they take a
 * per-identity lock or trigger a remote identity lookup.
 */
export default class DeviceAuthorizationTransitionRateLimiter extends DeviceAuthorizationRateLimiter {
  public static readonly WINDOW_MS = 60_000;
  public static readonly IDENTITY_LIMIT = 20;
  public static readonly NODE_LIMIT = 300;
  public static readonly MAX_TRACKED_IDENTITIES = 10_000;

  public constructor() {
    super({
      identityLimit: DeviceAuthorizationTransitionRateLimiter.IDENTITY_LIMIT,
      maxTrackedIdentities:
        DeviceAuthorizationTransitionRateLimiter.MAX_TRACKED_IDENTITIES,
      nodeLimit: DeviceAuthorizationTransitionRateLimiter.NODE_LIMIT,
      windowMs: DeviceAuthorizationTransitionRateLimiter.WINDOW_MS,
    });
  }
}
