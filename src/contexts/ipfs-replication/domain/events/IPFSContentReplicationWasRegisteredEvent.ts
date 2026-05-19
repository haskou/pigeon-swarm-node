import DomainEvent from '@app/shared/domain/events/DomainEvent';

type IPFSContentReplicationWasRegisteredAttributes = {
  cid: string;
  contentType: string;
  context: string;
  createdAt: number;
  filename?: string;
  networkIds: string[];
  ownerIdentityId?: string;
  priority: string;
  sizeBytes: number;
  updatedAt: number;
};

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
