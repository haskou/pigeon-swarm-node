import { DeviceAuthorizationRevision } from './value-objects/DeviceAuthorizationRevision';

/**
 * A replicated source offered to precedence: the revision it reaches and the
 * canonical form of the source, so sources reaching one revision resolve the
 * same way on every replica. `payload` is the caller's own record, returned
 * untouched.
 */
export interface DeviceAuthorizationSourceCandidate<T> {
  encoding: string;
  payload: T;
  revision: DeviceAuthorizationRevision;
}
