import KeychainSyncResponder from '@app/contexts/keychains/application/respond-sync/KeychainSyncResponder';
import { KeychainSyncResponseMessage } from '@app/contexts/keychains/application/respond-sync/messages/KeychainSyncResponseMessage';
import { KeychainSyncRequestedEvent } from '@app/contexts/keychains/domain/events/KeychainSyncRequestedEvent';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';
import Consumer from '@app/shared/infrastructure/ui/consumers/Consumer';

export default class RespondToKeychainSyncRequest extends Consumer {
  public static QUEUE_NAME = 'pigeon-swarm.respond-to-keychain-sync-request';

  constructor(
    consumer: DomainEventConsumer,
    private readonly responder: KeychainSyncResponder,
  ) {
    super(consumer);
  }

  public get queueName(): string {
    return RespondToKeychainSyncRequest.QUEUE_NAME;
  }

  public get eventName(): string {
    return KeychainSyncRequestedEvent.EVENT_NAME;
  }

  public get domainEvent(): typeof DomainEvent {
    return KeychainSyncRequestedEvent;
  }

  public get exchange(): string {
    return process.env.SERVICE_NAME || 'pigeon-swarm';
  }

  public async handler(event: DomainEvent): Promise<void> {
    await this.responder.respond(
      new KeychainSyncResponseMessage(
        String(event.attributes.ownerIdentityId || event.aggregateId),
        event.attributes.requestId
          ? String(event.attributes.requestId)
          : undefined,
      ),
    );
  }
}
