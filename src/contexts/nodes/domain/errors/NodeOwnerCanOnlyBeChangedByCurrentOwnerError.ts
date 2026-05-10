import { DomainError } from '@haskou/value-objects';

export class NodeOwnerCanOnlyBeChangedByCurrentOwnerError extends DomainError {
  constructor() {
    super('Node owner can only be changed by the current owner.');
  }
}
