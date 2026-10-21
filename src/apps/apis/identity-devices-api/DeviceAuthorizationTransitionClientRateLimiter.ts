import { ClientAddressRateLimiter } from './ClientAddressRateLimiter';

/** Bounds the transition-log reads per client address. */
export default class DeviceAuthorizationTransitionClientRateLimiter extends ClientAddressRateLimiter {
  public static readonly WINDOW_MS = 60_000;
  public static readonly ADDRESS_LIMIT = 60;
  public static readonly MAX_TRACKED_ADDRESSES = 10_000;

  public constructor() {
    super({
      addressLimit:
        DeviceAuthorizationTransitionClientRateLimiter.ADDRESS_LIMIT,
      maxTrackedAddresses:
        DeviceAuthorizationTransitionClientRateLimiter.MAX_TRACKED_ADDRESSES,
      windowMs: DeviceAuthorizationTransitionClientRateLimiter.WINDOW_MS,
    });
  }
}
