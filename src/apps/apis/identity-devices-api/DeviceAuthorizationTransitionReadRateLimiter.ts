import { DeviceAuthorizationRateLimiter } from './DeviceAuthorizationRateLimiter';

/**
 * Bounds transition-log reads per served requesting identity (canonical id), so
 * one caller cannot exhaust the reads of another.
 */
export default class DeviceAuthorizationTransitionReadRateLimiter extends DeviceAuthorizationRateLimiter {
  public static readonly WINDOW_MS = 60_000;
  public static readonly IDENTITY_LIMIT = 60;
  public static readonly NODE_LIMIT = 3000;
  public static readonly MAX_TRACKED_IDENTITIES = 10_000;

  public constructor() {
    super({
      identityLimit:
        DeviceAuthorizationTransitionReadRateLimiter.IDENTITY_LIMIT,
      maxTrackedIdentities:
        DeviceAuthorizationTransitionReadRateLimiter.MAX_TRACKED_IDENTITIES,
      nodeLimit: DeviceAuthorizationTransitionReadRateLimiter.NODE_LIMIT,
      windowMs: DeviceAuthorizationTransitionReadRateLimiter.WINDOW_MS,
    });
  }
}
