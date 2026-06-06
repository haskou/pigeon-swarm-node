import DomainEvent from '@app/shared/domain/events/DomainEvent';

import { IPFSContentReplicationWasRegisteredAttributes } from './types/IPFSContentReplicationWasRegisteredAttributes';

export class IPFSContentReplicationWasRegisteredEvent extends DomainEvent {
  public static EVENT_NAME = 'ipfs.v1.content.replication.was_registered';

  constructor(
    aggregateId: string,
    attributes: IPFSContentReplicationWasRegisteredAttributes,
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
    return IPFSContentReplicationWasRegisteredEvent.EVENT_NAME;
  }
}
