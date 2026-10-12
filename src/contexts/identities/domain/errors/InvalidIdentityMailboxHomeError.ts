import { DomainError } from '@haskou/value-objects';

export class InvalidIdentityMailboxHomeError extends DomainError {
  constructor() {
    super(
      'Invalid identity mailbox home. Expected an http or https origin without path, query, fragment or credentials.',
    );
  }
}
