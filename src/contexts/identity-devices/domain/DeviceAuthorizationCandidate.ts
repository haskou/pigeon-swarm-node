import { DeviceAuthorizationTransition } from './DeviceAuthorizationTransition';

/**
 * A transition offered to the replay. `encoding` is the canonical form of the
 * source record, so equivalent candidates resolve the same way on every
 * replica. `payload` is the caller's own record, returned untouched.
 */
export interface DeviceAuthorizationCandidate<T> {
  encoding: string;
  payload: T;
  transition: DeviceAuthorizationTransition;
}
