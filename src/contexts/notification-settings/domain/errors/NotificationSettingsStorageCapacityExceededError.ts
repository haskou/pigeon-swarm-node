import { DomainError } from '@haskou/value-objects';

export class NotificationSettingsStorageCapacityExceededError extends DomainError {
  public constructor() {
    super('Notification settings storage capacity exceeded');
  }
}
