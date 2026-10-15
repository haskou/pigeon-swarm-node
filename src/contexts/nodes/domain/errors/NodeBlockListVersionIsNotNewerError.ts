import { DomainError } from '@haskou/value-objects';

export class NodeBlockListVersionIsNotNewerError extends DomainError {
  constructor() {
    super('Node block list version must be higher than the stored one.');
  }
}
