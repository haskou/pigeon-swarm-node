import { assert, Integer, NumberValueObject } from '@haskou/value-objects';

import { InvalidPrivateAuthorizationError } from '../errors/InvalidPrivateAuthorizationError';

export class PrivateAuthorizationRevision extends Integer {
  public constructor(value: number | NumberValueObject) {
    super(value);
    assert(
      Number.isSafeInteger(this.valueOf()) && this.isGreaterOrEqualThan(0),
      new InvalidPrivateAuthorizationError(),
    );
  }
}
