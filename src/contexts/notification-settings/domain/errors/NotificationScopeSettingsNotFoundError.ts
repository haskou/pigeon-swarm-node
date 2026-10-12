import { DomainError } from '@haskou/value-objects';

export class NotificationScopeSettingsNotFoundError extends DomainError {
  constructor() {
    super('Notification scope settings not found.');
  }
}
