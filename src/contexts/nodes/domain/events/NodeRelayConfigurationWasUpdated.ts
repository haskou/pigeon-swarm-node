import { DomainEvent } from '@haskou/ddd-kernel/domain';
import { PrimitiveOf } from '@haskou/value-objects';

import { NodeRelayConfiguration } from '../NodeRelayConfiguration';

export class NodeRelayConfigurationWasUpdated extends DomainEvent {
  public static EVENT_NAME = 'nodes.v1.node.relay_configuration.was_updated';

  public constructor(
    aggregateId: string,
    public readonly attributes: {
      relayConfiguration: PrimitiveOf<NodeRelayConfiguration>;
    },
  ) {
    super(aggregateId);
  }

  public eventName(): string {
    return NodeRelayConfigurationWasUpdated.EVENT_NAME;
  }
}
