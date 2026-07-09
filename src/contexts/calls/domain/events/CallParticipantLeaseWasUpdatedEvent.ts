import { DomainEvent } from '@haskou/ddd-kernel/domain';

import { CallParticipantLeaseWasUpdatedAttributes } from './CallParticipantLeaseWasUpdatedAttributes';

export class CallParticipantLeaseWasUpdatedEvent extends DomainEvent {
  public static EVENT_NAME = 'calls.v1.participant_lease.was_updated';

  constructor(
    aggregateId: string,
    attributes: CallParticipantLeaseWasUpdatedAttributes,
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
    return CallParticipantLeaseWasUpdatedEvent.EVENT_NAME;
  }
}
