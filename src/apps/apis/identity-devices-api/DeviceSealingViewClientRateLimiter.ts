import { ClientAddressRateLimiter } from './ClientAddressRateLimiter';

/** Bounds the anonymous sealing-view reads per client address. */
export default class DeviceSealingViewClientRateLimiter extends ClientAddressRateLimiter {
  public static readonly WINDOW_MS = 60_000;
  public static readonly ADDRESS_LIMIT = 60;
  public static readonly MAX_TRACKED_ADDRESSES = 10_000;

  public constructor() {
    super({
      addressLimit: DeviceSealingViewClientRateLimiter.ADDRESS_LIMIT,
      maxTrackedAddresses:
        DeviceSealingViewClientRateLimiter.MAX_TRACKED_ADDRESSES,
      windowMs: DeviceSealingViewClientRateLimiter.WINDOW_MS,
    });
  }
}
