import { DomainError } from '@haskou/value-objects';

export class IdentityCannotLeaveNetworkError extends DomainError {
  constructor() {
    super('Identity cannot leave a network once it has joined it.');
  }
}
