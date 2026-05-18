import { assert, Integer, NumberValueObject } from '@haskou/value-objects';

import { InvalidKeychainVersionError } from '../errors/InvalidKeychainVersionError';

export class KeychainVersion extends Integer {
  constructor(value: number | NumberValueObject) {
    super(value);

    assert(this.isGreaterThan(0), new InvalidKeychainVersionError());
  }

  public next(): KeychainVersion {
    return new KeychainVersion(this.valueOf() + 1);
  }

  public isFirst(): boolean {
    return this.isEqual(new KeychainVersion(1));
  }

  public isNextAfter(previous: KeychainVersion): boolean {
    return this.isEqual(previous.next());
  }
}
