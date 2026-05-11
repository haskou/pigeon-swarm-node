import { DomainError } from '@haskou/value-objects';

export class RemoteMessageCandidateMismatchError extends DomainError {
  constructor() {
    super('Remote message candidate does not match the announced message.');
  }
}
