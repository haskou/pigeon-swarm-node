import { DomainError } from '@haskou/value-objects';

export class InvalidIdentityMailboxHomeError extends DomainError {
  constructor() {
    super(
      'Invalid identity mailbox home. Expected a canonical http or https base URL: scheme, host, optional port and path prefix, with no trailing slash, query, fragment or credentials.',
    );
  }
}
