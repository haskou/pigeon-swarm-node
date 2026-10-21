import { DomainError } from '@haskou/value-objects';

export class CallSignalAlreadySentError extends DomainError {
  constructor() {
    super('Call signal was already sent.');
  }
}
