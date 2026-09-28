import { DeviceAuthorizationPrimitives } from '../../../domain/DeviceAuthorizationPrimitives';
import { OrbitDBDeviceAuthorizationSource } from './OrbitDBDeviceAuthorizationSource';
import { OrbitDBDeviceAuthorizationTransitionRecord } from './OrbitDBDeviceAuthorizationTransitionRecord';

export interface OrbitDBDeviceAuthorizationDocument extends Record<
  string,
  unknown
> {
  authorization: DeviceAuthorizationPrimitives;
  checkpoint?: {
    authorization: DeviceAuthorizationPrimitives;
    lineage: OrbitDBDeviceAuthorizationTransitionRecord[];
    transition: OrbitDBDeviceAuthorizationTransitionRecord;
  };
  genesis: DeviceAuthorizationPrimitives;
  history: OrbitDBDeviceAuthorizationTransitionRecord[];
  id: string;
  identityId: string;
  kind: 'device_authorization';
  overflow?: {
    frontier: OrbitDBDeviceAuthorizationDocument;
    sources: OrbitDBDeviceAuthorizationSource[];
  };
  sources?: OrbitDBDeviceAuthorizationSource[];
}
