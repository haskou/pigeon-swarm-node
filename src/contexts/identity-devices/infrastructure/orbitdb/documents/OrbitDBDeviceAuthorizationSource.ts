import { DeviceAuthorizationPrimitives } from '../../../domain/DeviceAuthorizationPrimitives';
import { OrbitDBDeviceAuthorizationTransitionRecord } from './OrbitDBDeviceAuthorizationTransitionRecord';

export interface OrbitDBDeviceAuthorizationSource {
  checkpoint?: {
    authorization: DeviceAuthorizationPrimitives;
    concurrent?: OrbitDBDeviceAuthorizationTransitionRecord[];
    lineage: OrbitDBDeviceAuthorizationTransitionRecord[];
    transition: OrbitDBDeviceAuthorizationTransitionRecord;
  };
  history: OrbitDBDeviceAuthorizationTransitionRecord[];
}
