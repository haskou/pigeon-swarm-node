import { assert, StringValueObject } from '@haskou/value-objects';
import { Buffer } from 'buffer';

import { InvalidPrivateAuthorizationError } from '../errors/InvalidPrivateAuthorizationError';

export class PrivateAuthorizationGenesisFingerprint extends StringValueObject {
  private static readonly BYTES = 32;
  private static readonly CHARACTERS = 43;

  public constructor(value: string | StringValueObject) {
    super(value, PrivateAuthorizationGenesisFingerprint.CHARACTERS);
    const bytes = Buffer.from(this.valueOf(), 'base64url');

    assert(
      bytes.length === PrivateAuthorizationGenesisFingerprint.BYTES &&
        bytes.toString('base64url') === this.valueOf(),
      new InvalidPrivateAuthorizationError(),
    );
  }
}
