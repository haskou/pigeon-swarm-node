import { DomainError } from '@haskou/value-objects';

export class InvalidCallParticipantMediaConnectionError extends DomainError {
  constructor() {
    super('Call media connections must target another call participant once.');
  }
}
