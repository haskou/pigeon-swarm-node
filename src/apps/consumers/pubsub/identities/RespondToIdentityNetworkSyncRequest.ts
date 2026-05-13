import IdentityNetworkSyncResponder from '@app/contexts/identities/application/respond-network-sync/IdentityNetworkSyncResponder';
import { IdentityNetworkSyncResponseMessage } from '@app/contexts/identities/application/respond-network-sync/messages/IdentityNetworkSyncResponseMessage';
import { IdentityNetworkSyncRequestedEvent } from '@app/contexts/identities/domain/events/IdentityNetworkSyncRequestedEvent';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';
import Consumer from '@app/shared/infrastructure/ui/consumers/Consumer';

export default class RespondToIdentityNetworkSyncRequest extends Consumer {
  public static QUEUE_NAME =
    'pigeon-swarm.respond-to-identity-network-sync-request';

  constructor(
    consumer: DomainEventConsumer,
    private readonly responder: IdentityNetworkSyncResponder,
  ) {
    super(consumer);
  }

  public get queueName(): string {
    return RespondToIdentityNetworkSyncRequest.QUEUE_NAME;
  }

  public get eventName(): string {
    return IdentityNetworkSyncRequestedEvent.EVENT_NAME;
  }

  public get domainEvent(): typeof DomainEvent {
    return IdentityNetworkSyncRequestedEvent;
  }

  public get exchange(): string {
    return process.env.SERVICE_NAME || 'pigeon-swarm';
  }

  public async handler(event: DomainEvent): Promise<void> {
    await this.responder.respond(
      new IdentityNetworkSyncResponseMessage(
        String(event.attributes.networkId || event.aggregateId),
        event.attributes.requestId
          ? String(event.attributes.requestId)
          : undefined,
      ),
    );
  }
}
