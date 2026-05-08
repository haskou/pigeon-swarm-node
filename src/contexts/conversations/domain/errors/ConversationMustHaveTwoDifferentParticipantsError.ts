import { DomainError } from '@haskou/value-objects';

// eslint-disable-next-line max-len
export class ConversationMustHaveTwoDifferentParticipantsError extends DomainError {
  constructor() {
    super('One-to-one conversations must have two different participants');
  }
}
