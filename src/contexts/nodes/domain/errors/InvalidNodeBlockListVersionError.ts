import { DomainError } from '@haskou/value-objects';

export class InvalidNodeBlockListVersionError extends DomainError {
  constructor() {
    super('Node block list version must be a positive safe integer.');
  }
}
