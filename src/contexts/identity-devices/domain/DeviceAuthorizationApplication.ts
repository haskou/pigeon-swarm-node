import { DeviceAuthorization } from './DeviceAuthorization';

/**
 * Whether a transition applies to an authorization. A rejected transition is
 * an explicit outcome, not an error, so the replay can exclude it.
 */
export type DeviceAuthorizationApplication =
  { applied: true; authorization: DeviceAuthorization } | { applied: false };
