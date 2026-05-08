import { DomainError } from '@haskou/value-objects';

export class MessageTargetNotFoundError extends DomainError {
  constructor() {
    super('Message target was not found');
  }
}
