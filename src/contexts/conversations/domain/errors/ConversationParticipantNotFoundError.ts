import { DomainError } from '@haskou/value-objects';

export class ConversationParticipantNotFoundError extends DomainError {
  constructor() {
    super('Message author must be a conversation participant');
  }
}
