import { DomainError } from '@haskou/value-objects';

export class ConversationOperationLimitExceededError extends DomainError {
  constructor() {
    super('Conversation operation limit exceeded');
  }
}
