import { DomainError } from '@haskou/value-objects';

export class MessageTargetAuthorMismatchError extends DomainError {
  constructor() {
    super('Only the original message author can edit or delete it');
  }
}
