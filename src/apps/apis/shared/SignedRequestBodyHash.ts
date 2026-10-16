import { SHA256Hash } from '@haskou/pigeon-swarm-crypto';
import {
  assert,
  InvalidHashError,
  StringValueObject,
} from '@haskou/value-objects';

/**
 * Lowercase hex SHA-256 of the exact request body bytes. The client declares
 * it in `X-Body-Hash` and signs it in place of the body, so the request is
 * authenticated before any body byte is read.
 */
export class SignedRequestBodyHash extends SHA256Hash {
  public constructor(value: string | StringValueObject) {
    super(value);
    assert(
      this.valueOf() === this.valueOf().toLowerCase(),
      new InvalidHashError('SHA256', this.valueOf()),
    );
  }
}
