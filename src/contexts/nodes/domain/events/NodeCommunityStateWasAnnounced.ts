import { DomainEvent } from '@haskou/ddd-kernel/domain';

/**
 * Announces, to one network only, the digest of the community state this node
 * holds there. The aggregate id is the node's libp2p peer id on that network.
 */
export class NodeCommunityStateWasAnnounced extends DomainEvent {
  public static EVENT_NAME = 'nodes.v1.community_state.was_announced';

  constructor(
    aggregateId: string,
    attributes: { digest: string; networkId: string },
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
    return NodeCommunityStateWasAnnounced.EVENT_NAME;
  }
}
