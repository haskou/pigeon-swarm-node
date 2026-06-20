import DomainEvent from '@app/shared/domain/events/DomainEvent';

import { ContentReplicationWasClaimedAttributes } from './ContentReplicationWasClaimedAttributes';

export class ContentReplicationWasClaimedEvent extends DomainEvent {
  public static EVENT_NAME = 'content_replication.v1.replica.was_claimed';

  constructor(
    aggregateId: string,
    attributes: ContentReplicationWasClaimedAttributes,
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
    return ContentReplicationWasClaimedEvent.EVENT_NAME;
  }
}
