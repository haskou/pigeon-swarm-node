import { DeviceAuthorization } from './DeviceAuthorization';
import { DeviceCompromiseCaps } from './DeviceCompromiseCaps';

/**
 * Where a recovery lineage ends: the authorization it recovered to and the
 * compromise caps it carries forward.
 */
export interface DeviceAuthorizationRecoveryState {
  authorization: DeviceAuthorization;
  compromiseCaps: DeviceCompromiseCaps;
}
