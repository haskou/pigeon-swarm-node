import { Integer, NumberValueObject, assert } from '@haskou/value-objects';

import { InvalidIdentityAuthorizationRevisionError } from '../errors/InvalidIdentityAuthorizationRevisionError';

export class IdentityAuthorizationRevision extends Integer {
  public static initial(): IdentityAuthorizationRevision {
    return new IdentityAuthorizationRevision(0);
  }

  public constructor(value: number | NumberValueObject) {
    super(value);
    assert(
      Number.isSafeInteger(this.valueOf()) && this.isGreaterOrEqualThan(0),
      new InvalidIdentityAuthorizationRevisionError(),
    );
  }
}
