import { DomainEvent } from '@haskou/ddd-kernel/domain';

export class DeviceCredentialWasEnrolledEvent extends DomainEvent {
  public static EVENT_NAME =
    'identity_devices.v1.device_authorization.credential_enrolled';

  public eventName(): string {
    return DeviceCredentialWasEnrolledEvent.EVENT_NAME;
  }
}
