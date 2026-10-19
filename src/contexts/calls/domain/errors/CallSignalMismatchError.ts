import { DomainError } from '@haskou/value-objects';

export class CallSignalMismatchError extends DomainError {
  constructor() {
    super('Call signal does not match the request or the call.');
  }
}
