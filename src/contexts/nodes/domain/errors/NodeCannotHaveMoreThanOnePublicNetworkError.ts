import { DomainError } from '@haskou/value-objects';

export class NodeCannotHaveMoreThanOnePublicNetworkError extends DomainError {
  constructor() {
    super('A node cannot have more than one public network.');
  }
}
