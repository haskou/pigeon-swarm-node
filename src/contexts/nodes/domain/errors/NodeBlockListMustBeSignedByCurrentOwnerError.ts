import { DomainError } from '@haskou/value-objects';

export class NodeBlockListMustBeSignedByCurrentOwnerError extends DomainError {
  constructor() {
    super('Node block list must be signed by the current node owner.');
  }
}
