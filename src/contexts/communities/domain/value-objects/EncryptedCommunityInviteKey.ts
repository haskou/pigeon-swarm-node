import {
  assert,
  Integer,
  PrimitiveOf,
  StringValueObject,
  ValueObject,
} from '@haskou/value-objects';

import { InvalidEncryptedCommunityInviteKeyError } from '../errors/InvalidEncryptedCommunityInviteKeyError';

type KeyValue = {
  algorithm: string;
  ciphertext: string;
  nonce: string;
  version: number;
};

export class EncryptedCommunityInviteKey extends ValueObject<KeyValue> {
  private static readonly CURRENT_VERSION = 1;
  private static readonly SUPPORTED_ALGORITHM = 'AES-GCM';
  private static readonly BASE64URL = /^[A-Za-z0-9_-]+$/;
  private static readonly MAX_NONCE_LENGTH = 256;
  private static readonly MAX_CIPHERTEXT_LENGTH = 16_384;

  public static fromPrimitives(
    primitives: PrimitiveOf<EncryptedCommunityInviteKey>,
  ): EncryptedCommunityInviteKey {
    return new EncryptedCommunityInviteKey(
      new Integer(primitives.version),
      new StringValueObject(primitives.algorithm),
      new StringValueObject(primitives.nonce),
      new StringValueObject(primitives.ciphertext),
    );
  }

  constructor(
    version: Integer,
    algorithm: StringValueObject,
    nonce: StringValueObject,
    ciphertext: StringValueObject,
  ) {
    super({
      algorithm: algorithm.valueOf(),
      ciphertext: ciphertext.valueOf(),
      nonce: nonce.valueOf(),
      version: version.valueOf(),
    });
    assert(
      version.isEqual(new Integer(EncryptedCommunityInviteKey.CURRENT_VERSION)),
      new InvalidEncryptedCommunityInviteKeyError(
        'Unsupported encrypted community invite key version',
      ),
    );
    assert(
      algorithm.isEqual(
        new StringValueObject(EncryptedCommunityInviteKey.SUPPORTED_ALGORITHM),
      ),
      new InvalidEncryptedCommunityInviteKeyError(
        'Unsupported encrypted community invite key algorithm',
      ),
    );
    this.assertBase64Url(nonce, 'nonce');
    this.assertBase64Url(ciphertext, 'ciphertext');
    assert(
      nonce.valueOf().length <= EncryptedCommunityInviteKey.MAX_NONCE_LENGTH,
      new InvalidEncryptedCommunityInviteKeyError(
        'Encrypted community invite key nonce is too long',
      ),
    );
    assert(
      ciphertext.valueOf().length <=
        EncryptedCommunityInviteKey.MAX_CIPHERTEXT_LENGTH,
      new InvalidEncryptedCommunityInviteKeyError(
        'Encrypted community invite key ciphertext is too long',
      ),
    );
  }

  private assertBase64Url(value: StringValueObject, field: string): void {
    assert(
      !value.isEmpty() &&
        EncryptedCommunityInviteKey.BASE64URL.test(value.valueOf()),
      new InvalidEncryptedCommunityInviteKeyError(
        `Encrypted community invite key ${field} must be base64url`,
      ),
    );
  }

  public toPrimitives() {
    return this.valueOf();
  }
}
