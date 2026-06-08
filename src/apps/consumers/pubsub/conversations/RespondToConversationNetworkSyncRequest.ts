import ConversationNetworkSyncResponder from '@app/contexts/conversations/application/respond-network-sync/ConversationNetworkSyncResponder';
import { ConversationNetworkSyncResponseMessage } from '@app/contexts/conversations/application/respond-network-sync/messages/ConversationNetworkSyncResponseMessage';
import { ConversationNetworkSyncRequestedEvent } from '@app/contexts/conversations/domain/events/ConversationNetworkSyncRequestedEvent';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';
import Consumer from '@app/shared/infrastructure/ui/consumers/Consumer';

export default class RespondToConversationNetworkSyncRequest extends Consumer {
  public static QUEUE_NAME =
    'pigeon-swarm.respond-to-conversation-network-sync-request';

  constructor(
    consumer: DomainEventConsumer,
    private readonly responder: ConversationNetworkSyncResponder,
  ) {
    super(consumer);
  }

  public get queueName(): string {
    return RespondToConversationNetworkSyncRequest.QUEUE_NAME;
  }

  public get eventName(): string {
    return ConversationNetworkSyncRequestedEvent.EVENT_NAME;
  }

  public get domainEvent(): typeof DomainEvent {
    return ConversationNetworkSyncRequestedEvent;
  }

  public get exchange(): string {
    return process.env.SERVICE_NAME || 'pigeon-swarm';
  }

  public async handler(event: DomainEvent): Promise<void> {
    await this.responder.respond(
      new ConversationNetworkSyncResponseMessage(
        String(event.attributes.networkId || event.aggregateId),
        event.attributes.requestId
          ? String(event.attributes.requestId)
          : undefined,
      ),
    );
  }
}
