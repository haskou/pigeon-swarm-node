import KeychainNetworkSyncResponder from '@app/contexts/keychains/application/respond-network-sync/KeychainNetworkSyncResponder';
import { KeychainNetworkSyncResponseMessage } from '@app/contexts/keychains/application/respond-network-sync/messages/KeychainNetworkSyncResponseMessage';
import { KeychainNetworkSyncRequestedEvent } from '@app/contexts/keychains/domain/events/KeychainNetworkSyncRequestedEvent';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';
import Consumer from '@app/shared/infrastructure/ui/consumers/Consumer';

export default class RespondToKeychainNetworkSyncRequest extends Consumer {
  public static QUEUE_NAME =
    'pigeon-swarm.respond-to-keychain-network-sync-request';

  constructor(
    consumer: DomainEventConsumer,
    private readonly responder: KeychainNetworkSyncResponder,
  ) {
    super(consumer);
  }

  public get queueName(): string {
    return RespondToKeychainNetworkSyncRequest.QUEUE_NAME;
  }

  public get eventName(): string {
    return KeychainNetworkSyncRequestedEvent.EVENT_NAME;
  }

  public get domainEvent(): typeof DomainEvent {
    return KeychainNetworkSyncRequestedEvent;
  }

  public get exchange(): string {
    return process.env.SERVICE_NAME || 'pigeon-swarm';
  }

  public async handler(event: DomainEvent): Promise<void> {
    await this.responder.respond(
      new KeychainNetworkSyncResponseMessage(
        String(event.attributes.networkId || event.aggregateId),
        event.attributes.requestId
          ? String(event.attributes.requestId)
          : undefined,
      ),
    );
  }
}
