import { DeviceAuthorizationCandidate } from '../DeviceAuthorizationCandidate';
import { DeviceAuthorizationRevision } from '../value-objects/DeviceAuthorizationRevision';

export interface RevisionGroup<T> {
  revision: DeviceAuthorizationRevision;
  candidates: DeviceAuthorizationCandidate<T>[];
}
