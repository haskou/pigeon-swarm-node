import { DomainError } from '@haskou/value-objects';

/** One error for missing, unknown, expired and used-up codes alike. */
export class NodeRegistrationCodeIsNotValidError extends DomainError {
  constructor() {
    super('Identity creation on this node needs a valid registration code.');
  }
}
