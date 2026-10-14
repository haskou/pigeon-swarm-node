import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { RecoveryAuthority } from '@app/contexts/identities/domain/value-objects/RecoveryAuthority';

/**
 * The key that signed a transition-log read: a device credential (authorized
 * at the head or not) or the recovery authority of the identity.
 */
export type DeviceAuthorizationTransitionReader =
  DeviceCredential | RecoveryAuthority;
