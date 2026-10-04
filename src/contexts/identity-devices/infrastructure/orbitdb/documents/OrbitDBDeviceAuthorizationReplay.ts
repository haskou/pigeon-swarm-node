import { DeviceAuthorization } from '../../../domain/DeviceAuthorization';
import { OrbitDBDeviceAuthorizationTransitionRecord } from './OrbitDBDeviceAuthorizationTransitionRecord';

export interface OrbitDBDeviceAuthorizationReplay {
  authorization: DeviceAuthorization;
  history: OrbitDBDeviceAuthorizationTransitionRecord[];
}
