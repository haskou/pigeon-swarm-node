import { DomainError } from '@haskou/value-objects';

export class MessageTargetAlreadyDeletedError extends DomainError {
  constructor() {
    super('Deleted messages cannot be edited or deleted again');
  }
}
