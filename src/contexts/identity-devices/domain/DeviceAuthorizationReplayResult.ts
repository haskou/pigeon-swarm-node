import { DeviceAuthorization } from './DeviceAuthorization';
import { DeviceAuthorizationCandidate } from './DeviceAuthorizationCandidate';

/**
 * The outcome of replaying candidates from a base: the accepted candidates in
 * replay order, the authorization they reach, and every checkpoint crossed.
 */
export interface DeviceAuthorizationReplayResult<T> {
  accepted: DeviceAuthorizationCandidate<T>[];
  authorization: DeviceAuthorization;
  checkpoints: DeviceAuthorization[];
}
