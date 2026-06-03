import DomainEvent from '@app/shared/domain/events/DomainEvent';

export type NotificationSettingsWereResetAttributes = {
  identityId: string;
  scope: {
    channelId?: string;
    communityId?: string;
    conversationId?: string;
    type: string;
  };
  scopeKey: string;
};

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
