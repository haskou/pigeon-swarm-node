import { UUID } from '@haskou/value-objects';

export class DeviceAuthorizationOperationId extends UUID {
  public static generate(): DeviceAuthorizationOperationId {
    return new DeviceAuthorizationOperationId(UUID.generate().valueOf());
  }

  public compareTo(other: DeviceAuthorizationOperationId): number {
    return this.valueOf().localeCompare(other.valueOf());
  }
}
