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
    /**
     * Recoveries at the checkpoint's revision that lost it. Each carries caps
     * that still hold after the heal.
     */
    concurrent?: OrbitDBDeviceAuthorizationTransitionRecord[];
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
