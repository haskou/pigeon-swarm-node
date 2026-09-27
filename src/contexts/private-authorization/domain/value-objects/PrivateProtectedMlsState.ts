import { assert, StringValueObject } from '@haskou/value-objects';
import { Buffer } from 'buffer';

import { InvalidPrivateAuthorizationError } from '../errors/InvalidPrivateAuthorizationError';

export class PrivateProtectedMlsState extends StringValueObject {
  private static readonly MAX_BYTES = 1_024 * 1_024;
  private static readonly MAX_BASE64URL_CHARACTERS = Math.ceil(
    (PrivateProtectedMlsState.MAX_BYTES * 4) / 3,
  );

  public constructor(value: string | StringValueObject) {
    super(value, PrivateProtectedMlsState.MAX_BASE64URL_CHARACTERS);
    const bytes = Buffer.from(this.valueOf(), 'base64url');

    assert(
      bytes.length > 0 &&
        bytes.length <= PrivateProtectedMlsState.MAX_BYTES &&
        bytes.toString('base64url') === this.valueOf(),
      new InvalidPrivateAuthorizationError(),
    );
  }

  public toBuffer(): Buffer {
    return Buffer.from(this.valueOf(), 'base64url');
  }
}
