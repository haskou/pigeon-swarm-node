import { DomainError } from '@haskou/value-objects';

import { ConversationId } from '../value-objects/ConversationId';

export class ConversationNotFoundError extends DomainError {
  constructor(id: ConversationId) {
    super(`Conversation with id ${id.valueOf()} not found`);
  }
}
