import DomainEvent from '@app/shared/domain/events/DomainEvent';

import { NodeHeartbeatAttributes } from './NodeHeartbeatAttributes';

export class NodeHeartbeatWasSent extends DomainEvent {
  public static EVENT_NAME = 'nodes.v1.node.heartbeat.was_sent';

  constructor(
    aggregateId: string,
    attributes: NodeHeartbeatAttributes,
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
    return NodeHeartbeatWasSent.EVENT_NAME;
  }
}
