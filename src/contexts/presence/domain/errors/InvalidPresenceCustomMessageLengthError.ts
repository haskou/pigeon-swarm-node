import { DomainError } from '@haskou/value-objects';

export class InvalidPresenceCustomMessageLengthError extends DomainError {
  constructor(maxLength: number) {
    super(`Presence custom message cannot be longer than ${maxLength} chars.`);
  }
}
