import { DomainError } from '@haskou/value-objects';

export class InvalidPresenceStatusError extends DomainError {
  constructor(value: string) {
    super(`Invalid presence status: ${value}`);
  }
}
