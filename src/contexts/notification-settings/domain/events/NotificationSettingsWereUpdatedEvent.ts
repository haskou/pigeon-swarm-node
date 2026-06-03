import DomainEvent from '@app/shared/domain/events/DomainEvent';

export type NotificationSettingsWereUpdatedAttributes = {
  hideMutedChannels: boolean;
  identityId: string;
  mobilePushEnabled: boolean;
  mutedUntil?: number | null;
  notificationLevel: string;
  scope: {
    channelId?: string;
    communityId?: string;
    conversationId?: string;
    type: string;
  };
  scopeKey: string;
  suppressEveryoneAndHere: boolean;
  suppressRoleMentions: boolean;
};

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
