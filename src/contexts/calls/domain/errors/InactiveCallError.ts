import { DomainError } from '@haskou/value-objects';

export class InactiveCallError extends DomainError {
  constructor() {
    super('Call is not active.');
  }
}
