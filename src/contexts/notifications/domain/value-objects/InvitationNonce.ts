import { StringValueObject } from '@haskou/value-objects';

/** Client generated, base64url, bounded: it only has to make the invitation id unique. */
export class InvitationNonce extends StringValueObject {
  constructor(value: string) {
    super(value);

    if (!/^[A-Za-z0-9_-]{16,128}$/.test(value)) {
      throw new Error('Invalid invitation nonce.');
    }
  }
}
