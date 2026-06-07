import { DomainError } from '@haskou/value-objects';

export class InvalidPushSubscriptionEndpointError extends DomainError {
  constructor() {
    super('Push subscription endpoint must use a supported Web Push provider.');
  }
}
