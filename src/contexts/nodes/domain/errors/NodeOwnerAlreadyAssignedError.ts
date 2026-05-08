import { DomainError } from '@haskou/value-objects';

export class NodeOwnerAlreadyAssignedError extends DomainError {
  constructor() {
    super('Node owner has already been assigned.');
  }
}
