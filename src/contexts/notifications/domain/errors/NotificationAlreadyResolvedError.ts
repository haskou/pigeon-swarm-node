import { DomainError } from '@haskou/value-objects';

export class NotificationAlreadyResolvedError extends DomainError {
  constructor() {
    super('Notification was already accepted or declined.');
  }
}
