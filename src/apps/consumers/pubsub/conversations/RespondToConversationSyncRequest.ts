import ConversationSyncResponder from '@app/contexts/conversations/application/respond-sync/ConversationSyncResponder';
import { ConversationSyncResponseMessage } from '@app/contexts/conversations/application/respond-sync/messages/ConversationSyncResponseMessage';
import { ConversationSyncRequestedEvent } from '@app/contexts/conversations/domain/events/ConversationSyncRequestedEvent';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';
import Consumer from '@app/shared/infrastructure/ui/consumers/Consumer';

export default class RespondToConversationSyncRequest extends Consumer {
  public static QUEUE_NAME =
    'pigeon-swarm.respond-to-conversation-sync-request';

  constructor(
    consumer: DomainEventConsumer,
    private readonly responder: ConversationSyncResponder,
  ) {
    super(consumer);
  }

  public get queueName(): string {
    return RespondToConversationSyncRequest.QUEUE_NAME;
  }

  public get eventName(): string {
    return ConversationSyncRequestedEvent.EVENT_NAME;
  }

  public get domainEvent(): typeof DomainEvent {
    return ConversationSyncRequestedEvent;
  }

  public get exchange(): string {
    return process.env.SERVICE_NAME || 'pigeon-swarm';
  }

  public async handler(event: DomainEvent): Promise<void> {
    await this.responder.respond(
      new ConversationSyncResponseMessage(
        String(event.attributes.conversationId || event.aggregateId),
        event.attributes.requestId
          ? String(event.attributes.requestId)
          : undefined,
      ),
    );
  }
}
