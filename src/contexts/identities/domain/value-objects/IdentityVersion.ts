import { assert, Integer, NumberValueObject } from '@haskou/value-objects';

import { InvalidIdentityVersionError } from '../errors/InvalidIdentityVersionError';

export class IdentityVersion extends Integer {
  constructor(value: number | NumberValueObject) {
    super(value);

    assert(this.isGreaterThan(0), new InvalidIdentityVersionError());
  }

  public next(): IdentityVersion {
    return new IdentityVersion(this.valueOf() + 1);
  }
}
