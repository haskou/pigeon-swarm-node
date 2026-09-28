import { DeviceAuthorizationPrimitives } from '../../../domain/DeviceAuthorizationPrimitives';
import { OrbitDBDeviceAuthorizationTransitionRecord } from './OrbitDBDeviceAuthorizationTransitionRecord';

export interface OrbitDBDeviceAuthorizationDocument extends Record<
  string,
  unknown
> {
  authorization: DeviceAuthorizationPrimitives;
  checkpoint?: {
    authorization: DeviceAuthorizationPrimitives;
    transition: OrbitDBDeviceAuthorizationTransitionRecord;
  };
  genesis: DeviceAuthorizationPrimitives;
  history: OrbitDBDeviceAuthorizationTransitionRecord[];
  id: string;
  identityId: string;
  kind: 'device_authorization';
}
