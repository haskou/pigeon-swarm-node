import DomainEvent from '@app/shared/domain/events/DomainEvent';

import { IPFSContentReplicationWasClaimedAttributes } from './types/IPFSContentReplicationWasClaimedAttributes';

export class IPFSContentReplicationWasClaimedEvent extends DomainEvent {
  public static EVENT_NAME = 'ipfs.v1.content.replication.was_claimed';

  constructor(
    aggregateId: string,
    attributes: IPFSContentReplicationWasClaimedAttributes,
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
    return IPFSContentReplicationWasClaimedEvent.EVENT_NAME;
  }
}
