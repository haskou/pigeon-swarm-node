import { assert, StringValueObject } from '@haskou/value-objects';

import { InvalidCommunityInviteNonceError } from '../errors/InvalidCommunityInviteNonceError';

export class CommunityInviteNonce extends StringValueObject {
  private static readonly MAX_LENGTH = 128;

  private static readonly MIN_LENGTH = 16;

  constructor(value: string | StringValueObject) {
    super(value, CommunityInviteNonce.MAX_LENGTH);

    assert(
      this.valueOf().length >= CommunityInviteNonce.MIN_LENGTH,
      new InvalidCommunityInviteNonceError(),
    );
  }
}
