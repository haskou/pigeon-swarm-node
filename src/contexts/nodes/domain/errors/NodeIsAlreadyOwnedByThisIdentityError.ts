import { DomainError } from '@haskou/value-objects';

export class NodeIsAlreadyOwnedByThisIdentityError extends DomainError {
  constructor() {
    super('The node is already owned by this identity.');
  }
}
