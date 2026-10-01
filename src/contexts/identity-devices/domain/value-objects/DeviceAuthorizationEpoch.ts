import { StringValueObject } from '@haskou/value-objects';

import { DeviceAuthorizationOperationId } from './DeviceAuthorizationOperationId';

export class DeviceAuthorizationEpoch extends StringValueObject {
  private static readonly GENESIS = 'genesis';

  public static genesis(): DeviceAuthorizationEpoch {
    return new DeviceAuthorizationEpoch(DeviceAuthorizationEpoch.GENESIS);
  }

  public static fromRecovery(
    operationId: DeviceAuthorizationOperationId,
  ): DeviceAuthorizationEpoch {
    return new DeviceAuthorizationEpoch(operationId.valueOf());
  }

  public constructor(value: string | StringValueObject) {
    super(value);

    if (this.valueOf() !== DeviceAuthorizationEpoch.GENESIS) {
      new DeviceAuthorizationOperationId(this.valueOf());
    }
  }
}
