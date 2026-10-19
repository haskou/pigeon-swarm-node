import { DomainError } from '@haskou/value-objects';

export class PrivateNetworkRequiredError extends DomainError {
  constructor() {
    super(
      'Direct conversations and private communities require a private network',
    );
  }
}
