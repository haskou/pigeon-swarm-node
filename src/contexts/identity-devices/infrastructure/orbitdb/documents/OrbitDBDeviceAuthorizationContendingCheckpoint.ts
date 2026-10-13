import { OrbitDBDeviceAuthorizationDocument } from './OrbitDBDeviceAuthorizationDocument';
import { OrbitDBDeviceAuthorizationTransitionRecord } from './OrbitDBDeviceAuthorizationTransitionRecord';

/**
 * A source checkpoint contending for the preferred checkpoint: its recovery,
 * and the concurrent recoveries it already carries as lost.
 */
export interface OrbitDBDeviceAuthorizationContendingCheckpoint {
  concurrent: OrbitDBDeviceAuthorizationTransitionRecord[];
  recovery: Omit<
    NonNullable<OrbitDBDeviceAuthorizationDocument['checkpoint']>,
    'concurrent'
  >;
}
