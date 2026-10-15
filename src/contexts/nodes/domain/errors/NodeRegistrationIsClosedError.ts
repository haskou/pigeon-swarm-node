import { DomainError } from '@haskou/value-objects';

export class NodeRegistrationIsClosedError extends DomainError {
  constructor() {
    super('Identity creation on this node is closed.');
  }
}
