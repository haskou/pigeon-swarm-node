import { DomainEvent } from '@haskou/ddd-kernel/domain';

export class DeviceCredentialWasCompromisedEvent extends DomainEvent {
  public static EVENT_NAME =
    'identity_devices.v1.device_authorization.credential_compromised';

  public eventName(): string {
    return DeviceCredentialWasCompromisedEvent.EVENT_NAME;
  }
}
