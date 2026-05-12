import { DomainError } from '@haskou/value-objects';

export class GroupConversationMustHaveTwoParticipantsError extends DomainError {
  constructor() {
    super('Group conversation must have at least two different participants');
  }
}
