import { DeviceAuthorizationPrimitives } from '../../../domain/DeviceAuthorizationPrimitives';
import { OrbitDBDeviceAuthorizationTransitionRecord } from './OrbitDBDeviceAuthorizationTransitionRecord';

export interface OrbitDBDeviceAuthorizationDocument extends Record<
  string,
  unknown
> {
  authorization: DeviceAuthorizationPrimitives;
  genesis: DeviceAuthorizationPrimitives;
  history: OrbitDBDeviceAuthorizationTransitionRecord[];
  id: string;
  kind: 'device_authorization';
}
