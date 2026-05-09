import { DomainError } from '@haskou/value-objects';

export class ConversationNotFoundError extends DomainError {
  constructor(id: string) {
    super(`Conversation with id ${id} not found`);
  }
}
