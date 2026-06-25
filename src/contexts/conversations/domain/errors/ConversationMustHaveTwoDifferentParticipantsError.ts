import { DomainError } from '@haskou/value-objects';

export class ConversationMustHaveTwoDifferentParticipantsError extends DomainError {
  constructor() {
    super('One-to-one conversations must have two different participants');
  }
}
