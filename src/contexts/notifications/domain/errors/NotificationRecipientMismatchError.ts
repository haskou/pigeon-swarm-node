import { DomainError } from '@haskou/value-objects';

export class NotificationRecipientMismatchError extends DomainError {
  constructor() {
    super('Authenticated identity is not the notification recipient.');
  }
}
