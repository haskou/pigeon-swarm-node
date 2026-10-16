import { DomainError } from '@haskou/value-objects';

/**
 * The owner id is not the one canonical encoding of a usable Ed25519 key: an
 * alias of another key's bytes or an id nobody can sign for.
 */
export class InvalidNodeOwnerIdentityIdError extends DomainError {
  constructor() {
    super('The node owner must be a valid identity id.');
  }
}
