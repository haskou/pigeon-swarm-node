import { Integer, NumberValueObject, assert } from '@haskou/value-objects';

import { InvalidDeviceSealedSecretBundleError } from '../errors/InvalidDeviceSealedSecretBundleError';

export class DeviceSealedSecretGeneration extends Integer {
  public constructor(value: number | NumberValueObject) {
    super(value);
    assert(
      this.isGreaterOrEqualThan(1),
      new InvalidDeviceSealedSecretBundleError(
        'generation must be a positive integer',
      ),
    );
  }
}
