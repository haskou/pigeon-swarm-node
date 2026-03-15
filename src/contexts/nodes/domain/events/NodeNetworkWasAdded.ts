import DomainEvent from '@app/shared/domain/events/DomainEvent';

export class NodeNetworkWasAdded extends DomainEvent {
  public static EVENT_NAME = 'nodes.v1.node.network.was_added';

  public eventName(): string {
    return NodeNetworkWasAdded.EVENT_NAME;
  }
}
