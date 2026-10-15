import { DomainError } from '@haskou/value-objects';

export class NodeRegistrationCodeExpiryIsOutOfRangeError extends DomainError {
  constructor(maxTtlDays: number) {
    super(
      `Registration code expiresAt must be in the future and at most ${maxTtlDays} days ahead.`,
    );
  }
}
