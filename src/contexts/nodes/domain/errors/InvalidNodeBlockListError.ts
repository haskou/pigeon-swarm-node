import { DomainError } from '@haskou/value-objects';

export class InvalidNodeBlockListError extends DomainError {
  constructor(reason: string) {
    super(`Node block list is not valid: ${reason}.`);
  }
}
