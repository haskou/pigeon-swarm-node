import { compareCodeUnits } from '@app/contexts/shared/domain/compareCodeUnits';
import { UUID } from '@haskou/value-objects';

export class DeviceAuthorizationOperationId extends UUID {
  public static generate(): DeviceAuthorizationOperationId {
    return new DeviceAuthorizationOperationId(UUID.generate().valueOf());
  }

  public compareTo(other: DeviceAuthorizationOperationId): number {
    return compareCodeUnits(this.valueOf(), other.valueOf());
  }
}
