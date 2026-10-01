import { DeviceAuthorizationTransition } from '@app/contexts/identity-devices/domain/DeviceAuthorizationTransition';

export class ApplyDeviceAuthorizationTransitionMessage {
  public constructor(
    public readonly transition: DeviceAuthorizationTransition,
  ) {}
}
