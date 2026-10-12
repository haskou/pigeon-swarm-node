import { DomainEvent } from '@haskou/ddd-kernel/domain';

export class DeviceCredentialWasRevokedEvent extends DomainEvent {
  public static EVENT_NAME =
    'identity_devices.v1.device_authorization.credential_revoked';

  public eventName(): string {
    return DeviceCredentialWasRevokedEvent.EVENT_NAME;
  }
}
