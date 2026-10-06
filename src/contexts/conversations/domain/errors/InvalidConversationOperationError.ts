import { DomainError } from '@haskou/value-objects';

export class InvalidConversationOperationError extends DomainError {
  constructor() {
    super('Invalid conversation operation');
  }
}
