import { assert, StringValueObject } from '@haskou/value-objects';

import { InvalidEncryptedMasterKeyError } from '../errors/InvalidEncryptedMasterKeyError';

export class EncryptedMasterKey extends StringValueObject {
  private static readonly MAX_LENGTH = 65_536;

  constructor(value: string | StringValueObject) {
    super(value, EncryptedMasterKey.MAX_LENGTH);

    assert(!this.isEmpty(), new InvalidEncryptedMasterKeyError());
  }
}
