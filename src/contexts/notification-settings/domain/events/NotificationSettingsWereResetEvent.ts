import { DomainEvent } from '@haskou/ddd-kernel/domain';

import { NotificationSettingsWereResetAttributes } from './NotificationSettingsWereResetAttributes';

export class NotificationSettingsWereResetEvent extends DomainEvent {
  public static EVENT_NAME =
    'notification_settings.v1.scope_settings.was_reset';

  constructor(
    aggregateId: string,
    attributes: NotificationSettingsWereResetAttributes,
    eventId?: string,
    occurredOn?: Date,
    correlationId?: string,
    causationId?: string,
  ) {
    super(
      aggregateId,
      attributes,
      eventId,
      occurredOn,
      correlationId,
      causationId,
    );
  }

  public eventName(): string {
    return NotificationSettingsWereResetEvent.EVENT_NAME;
  }
}
