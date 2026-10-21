import { DeviceAuthorizationRateLimiter } from './DeviceAuthorizationRateLimiter';

/** Bounds the public sealing-view reads per target identity. */
export default class DeviceSealingViewRateLimiter extends DeviceAuthorizationRateLimiter {
  public static readonly WINDOW_MS = 60_000;
  public static readonly IDENTITY_LIMIT = 300;
  public static readonly NODE_LIMIT = 3000;
  public static readonly MAX_TRACKED_IDENTITIES = 10_000;

  public constructor() {
    super({
      identityLimit: DeviceSealingViewRateLimiter.IDENTITY_LIMIT,
      maxTrackedIdentities: DeviceSealingViewRateLimiter.MAX_TRACKED_IDENTITIES,
      nodeLimit: DeviceSealingViewRateLimiter.NODE_LIMIT,
      windowMs: DeviceSealingViewRateLimiter.WINDOW_MS,
    });
  }
}
