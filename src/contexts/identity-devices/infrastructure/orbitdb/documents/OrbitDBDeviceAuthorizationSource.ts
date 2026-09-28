import { DeviceAuthorizationPrimitives } from '../../../domain/DeviceAuthorizationPrimitives';
import { OrbitDBDeviceAuthorizationTransitionRecord } from './OrbitDBDeviceAuthorizationTransitionRecord';

export interface OrbitDBDeviceAuthorizationSource {
  checkpoint?: {
    authorization: DeviceAuthorizationPrimitives;
    lineage: OrbitDBDeviceAuthorizationTransitionRecord[];
    transition: OrbitDBDeviceAuthorizationTransitionRecord;
  };
  history: OrbitDBDeviceAuthorizationTransitionRecord[];
}
