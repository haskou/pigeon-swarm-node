import { DomainError } from '@haskou/value-objects';

export class InvalidIdentitySignatureError extends DomainError {
  constructor() {
    super('Invalid signature for the provided identity data.');
  }
}
