import DomainEvent from '@app/shared/domain/events/DomainEvent';

import { NotificationSettingsWereUpdatedAttributes } from './types/NotificationSettingsWereUpdatedAttributes';

export class NotificationSettingsWereUpdatedEvent extends DomainEvent {
  public static EVENT_NAME =
    'notification_settings.v1.scope_settings.was_updated';

  constructor(
    aggregateId: string,
    attributes: NotificationSettingsWereUpdatedAttributes,
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
    return NotificationSettingsWereUpdatedEvent.EVENT_NAME;
  }
}
