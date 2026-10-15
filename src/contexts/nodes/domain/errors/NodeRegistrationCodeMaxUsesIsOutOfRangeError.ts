import { DomainError } from '@haskou/value-objects';

export class NodeRegistrationCodeMaxUsesIsOutOfRangeError extends DomainError {
  constructor(maxUses: number) {
    super(`Registration code maxUses must be between 1 and ${maxUses}.`);
  }
}
