import { DomainError } from '@haskou/value-objects';

export class InvalidConversationTypeError extends DomainError {
  constructor() {
    super('Invalid conversation type');
  }
}
