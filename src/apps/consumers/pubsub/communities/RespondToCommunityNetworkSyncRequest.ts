import CommunityNetworkSyncResponder from '@app/contexts/communities/application/respond-network-sync/CommunityNetworkSyncResponder';
import { CommunityNetworkSyncResponseMessage } from '@app/contexts/communities/application/respond-network-sync/messages/CommunityNetworkSyncResponseMessage';
import { CommunityNetworkSyncRequestedEvent } from '@app/contexts/communities/domain/events/CommunityNetworkSyncRequestedEvent';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';
import Consumer from '@app/shared/infrastructure/ui/consumers/Consumer';

export default class RespondToCommunityNetworkSyncRequest extends Consumer {
  public static QUEUE_NAME =
    'pigeon-swarm.respond-to-community-network-sync-request';

  constructor(
    consumer: DomainEventConsumer,
    private readonly responder: CommunityNetworkSyncResponder,
  ) {
    super(consumer);
  }

  public get queueName(): string {
    return RespondToCommunityNetworkSyncRequest.QUEUE_NAME;
  }

  public get eventName(): string {
    return CommunityNetworkSyncRequestedEvent.EVENT_NAME;
  }

  public get domainEvent(): typeof DomainEvent {
    return CommunityNetworkSyncRequestedEvent;
  }

  public get exchange(): string {
    return process.env.SERVICE_NAME || 'pigeon-swarm';
  }

  public async handler(event: DomainEvent): Promise<void> {
    await this.responder.respond(
      new CommunityNetworkSyncResponseMessage(
        String(event.attributes.networkId || event.aggregateId),
        event.attributes.requestId
          ? String(event.attributes.requestId)
          : undefined,
      ),
    );
  }
}
