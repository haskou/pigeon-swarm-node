import { DomainError } from '@haskou/value-objects';

/**
 * The owner's keychain cannot be proven because routed keychain records could
 * not be read. The reason stays on `cause` and is never sent to clients.
 */
export class KeychainOwnershipUnverifiedError extends DomainError {
  public readonly cause: unknown;

  constructor(cause: unknown) {
    super(
      'Owner identity keychain could not be verified. Retry the publish later.',
    );
    this.cause = cause;
  }
}
