import { StringValueObject } from '@haskou/value-objects';

/** Client generated, base64url, bounded: it only makes the call id unique. */
export class CallNonce extends StringValueObject {
  constructor(value: string) {
    super(value);

    if (!/^[A-Za-z0-9_-]{16,128}$/.test(value)) {
      throw new Error('Invalid call nonce.');
    }
  }
}
