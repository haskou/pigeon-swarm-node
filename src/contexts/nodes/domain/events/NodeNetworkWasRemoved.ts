import DomainEvent from '@app/shared/domain/events/DomainEvent';

export class NodeNetworkWasRemoved extends DomainEvent {
  public static EVENT_NAME = 'nodes.v1.node.network.was_removed';

  public constructor(
    aggregateId: string,
    public readonly attributes: {
      networkId: string;
    },
  ) {
    super(aggregateId);
  }

  public eventName(): string {
    return NodeNetworkWasRemoved.EVENT_NAME;
  }
}
