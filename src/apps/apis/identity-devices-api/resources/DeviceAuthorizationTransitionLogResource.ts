import { DeviceAuthorizationTransitionPrimitives } from '@app/contexts/identity-devices/domain/DeviceAuthorizationTransitionPrimitives';

export interface DeviceAuthorizationTransitionLogResource {
  concurrentRecoveries: DeviceAuthorizationTransitionPrimitives[];
  identityId: string;
  /** The revision to continue from, or null once the log is exhausted. */
  nextCursor: string | null;
  recoveries: DeviceAuthorizationTransitionPrimitives[];
  transitions: DeviceAuthorizationTransitionPrimitives[];
}
