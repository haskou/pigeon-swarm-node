import { assert, StringValueObject } from '@haskou/value-objects';

import { InvalidIdentityMailboxHomeError } from '../errors/InvalidIdentityMailboxHomeError';

/**
 * Base URL of the node hosting an identity's mailboxes. Only the canonical form
 * is accepted, because the identity signature covers the exact string: scheme,
 * host, optional port, optional path prefix, and no trailing slash.
 */
export class IdentityMailboxHome extends StringValueObject {
  private static readonly MAX_LENGTH = 255;
  private static readonly ALLOWED_PROTOCOLS = ['http:', 'https:'];

  private static canonicalOf(url: URL): string {
    return `${url.origin}${url.pathname.replace(/\/$/, '')}`;
  }

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
        !url.pathname.includes('//') &&
        this.value === IdentityMailboxHome.canonicalOf(url)
      );
    } catch {
      return false;
    }
  }
}
