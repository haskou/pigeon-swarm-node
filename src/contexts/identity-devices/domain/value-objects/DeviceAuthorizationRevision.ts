import { Integer, NumberValueObject, assert } from '@haskou/value-objects';

import { InvalidDeviceAuthorizationTransitionError } from '../errors/InvalidDeviceAuthorizationTransitionError';

export class DeviceAuthorizationRevision extends Integer {
  public static initial(): DeviceAuthorizationRevision {
    return new DeviceAuthorizationRevision(0);
  }

  public constructor(value: number | NumberValueObject) {
    super(value);
    assert(
      Number.isSafeInteger(this.valueOf()) && this.isGreaterOrEqualThan(0),
      new InvalidDeviceAuthorizationTransitionError(),
    );
  }

  public next(): DeviceAuthorizationRevision {
    return new DeviceAuthorizationRevision(this.valueOf() + 1);
  }

  public immediatelyFollows(previous: DeviceAuthorizationRevision): boolean {
    return this.valueOf() === previous.next().valueOf();
  }
}
