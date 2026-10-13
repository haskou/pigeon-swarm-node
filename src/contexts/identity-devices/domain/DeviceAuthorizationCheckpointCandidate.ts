import { DeviceAuthorizationSourceCandidate } from './DeviceAuthorizationSourceCandidate';

/**
 * A recovery checkpoint offered to precedence. `encoding` is the canonical
 * form of the recovery and `revision` the revision it recovers at.
 * `sharesLineageWith` tells whether both recoveries extend the same recovery
 * lineage, so recoveries racing on one lineage are kept as concurrent.
 */
export interface DeviceAuthorizationCheckpointCandidate<
  T,
> extends DeviceAuthorizationSourceCandidate<T> {
  sharesLineageWith(other: DeviceAuthorizationCheckpointCandidate<T>): boolean;
}
