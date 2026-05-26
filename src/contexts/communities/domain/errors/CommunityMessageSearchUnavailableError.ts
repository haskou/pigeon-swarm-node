import { DomainError } from '@haskou/value-objects';

export class CommunityMessageSearchUnavailableError extends DomainError {
  constructor() {
    super('Only public community messages can be searched.');
  }
}
