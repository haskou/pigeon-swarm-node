import { DeviceAuthorizationTransitionPrimitives } from '@app/contexts/identity-devices/domain/DeviceAuthorizationTransitionPrimitives';

export interface DeviceAuthorizationTransitionLogResource {
  concurrentRecoveries: DeviceAuthorizationTransitionPrimitives[];
  identityId: string;
  recoveries: DeviceAuthorizationTransitionPrimitives[];
  transitions: DeviceAuthorizationTransitionPrimitives[];
}
