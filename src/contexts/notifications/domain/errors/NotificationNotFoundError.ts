import { DomainError } from '@haskou/value-objects';

export class NotificationNotFoundError extends DomainError {
  constructor() {
    super('Notification not found.');
  }
}
