import { DomainEvent } from '@haskou/ddd-kernel/domain';

export class DeviceAuthorizationWasRecoveredEvent extends DomainEvent {
  public static EVENT_NAME =
    'identity_devices.v1.device_authorization.recovered';

  public eventName(): string {
    return DeviceAuthorizationWasRecoveredEvent.EVENT_NAME;
  }
}
