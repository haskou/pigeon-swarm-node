import { DomainError } from '@haskou/value-objects';

export class CommunityOperationLimitExceededError extends DomainError {
  constructor() {
    super('Community operation limit exceeded');
  }
}
