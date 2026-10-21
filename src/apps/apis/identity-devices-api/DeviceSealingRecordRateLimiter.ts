import { DeviceAuthorizationRateLimiter } from './DeviceAuthorizationRateLimiter';

/** Bounds the sealing-record publications per identity, which bounds the signature verifications they cost. */
export default class DeviceSealingRecordRateLimiter extends DeviceAuthorizationRateLimiter {
  public static readonly WINDOW_MS = 60_000;
  public static readonly IDENTITY_LIMIT = 30;
  public static readonly NODE_LIMIT = 600;
  public static readonly MAX_TRACKED_IDENTITIES = 10_000;

  public constructor() {
    super({
      identityLimit: DeviceSealingRecordRateLimiter.IDENTITY_LIMIT,
      maxTrackedIdentities:
        DeviceSealingRecordRateLimiter.MAX_TRACKED_IDENTITIES,
      nodeLimit: DeviceSealingRecordRateLimiter.NODE_LIMIT,
      windowMs: DeviceSealingRecordRateLimiter.WINDOW_MS,
    });
  }
}
