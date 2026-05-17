import DomainEvent from '@app/shared/domain/events/DomainEvent';

export type IdentityPresenceWasUpdatedAttributes = {
  customMessage?: string;
  identityId: string;
  lastActivityAt?: number;
  lastHeartbeatAt?: number;
  networkIds: string[];
  status: string;
  updatedAt: number;
};

export class IdentityPresenceWasUpdatedEvent extends DomainEvent {
  public static EVENT_NAME = 'presence.v1.identity_presence.was_updated';

  constructor(
    aggregateId: string,
    attributes: IdentityPresenceWasUpdatedAttributes,
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
    return IdentityPresenceWasUpdatedEvent.EVENT_NAME;
  }
}
