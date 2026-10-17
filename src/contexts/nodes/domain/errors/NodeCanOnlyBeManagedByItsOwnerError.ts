import { DomainError } from '@haskou/value-objects';

export class NodeCanOnlyBeManagedByItsOwnerError extends DomainError {
  constructor() {
    super('Node can only be managed by its owner.');
  }
}
