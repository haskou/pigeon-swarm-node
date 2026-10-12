import { assert, StringValueObject } from '@haskou/value-objects';

import { InvalidIdentityMailboxHomeError } from '../errors/InvalidIdentityMailboxHomeError';

export class IdentityMailboxHome extends StringValueObject {
  private static readonly MAX_LENGTH = 255;
  private static readonly ALLOWED_PROTOCOLS = ['http:', 'https:'];

  constructor(value: string | StringValueObject) {
    super(value);

    assert(this.isValid(), new InvalidIdentityMailboxHomeError());
  }

  private isValid(): boolean {
    if (this.value.length > IdentityMailboxHome.MAX_LENGTH) {
      return false;
    }

    try {
      const url = new URL(this.value);

      return (
        IdentityMailboxHome.ALLOWED_PROTOCOLS.includes(url.protocol) &&
        url.origin === this.value
      );
    } catch {
      return false;
    }
  }
}
