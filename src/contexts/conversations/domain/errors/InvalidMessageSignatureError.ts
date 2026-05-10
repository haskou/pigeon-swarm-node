import { DomainError } from '@haskou/value-objects';

export class InvalidMessageSignatureError extends DomainError {
  constructor() {
    super('Message signature is not valid.');
  }
}
