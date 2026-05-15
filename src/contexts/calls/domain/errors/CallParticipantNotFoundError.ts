import { DomainError } from '@haskou/value-objects';

export class CallParticipantNotFoundError extends DomainError {
  constructor() {
    super('Call participant not found.');
  }
}
