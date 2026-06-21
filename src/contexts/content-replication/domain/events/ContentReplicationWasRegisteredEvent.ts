import DomainEvent from '@app/shared/domain/events/DomainEvent';

import { ContentReplicationWasRegisteredAttributes } from './ContentReplicationWasRegisteredAttributes';

export class ContentReplicationWasRegisteredEvent extends DomainEvent {
  public static EVENT_NAME = 'content_replication.v1.content.was_registered';

  constructor(
    aggregateId: string,
    attributes: ContentReplicationWasRegisteredAttributes,
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
    return ContentReplicationWasRegisteredEvent.EVENT_NAME;
  }
}
