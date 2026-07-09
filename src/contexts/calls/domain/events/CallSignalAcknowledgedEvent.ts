import { DomainEvent } from '@haskou/ddd-kernel/domain';

import { CallSignalAcknowledgedAttributes } from './CallSignalAcknowledgedAttributes';

export class CallSignalAcknowledgedEvent extends DomainEvent {
  public static EVENT_NAME = 'calls.v1.signal.acknowledged';

  constructor(
    aggregateId: string,
    attributes: CallSignalAcknowledgedAttributes,
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
    return CallSignalAcknowledgedEvent.EVENT_NAME;
  }
}
