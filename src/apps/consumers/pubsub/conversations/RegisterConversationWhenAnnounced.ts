import ConversationRegistrar from '@app/contexts/conversations/application/register-conversation/ConversationRegistrar';
import { RegisterConversationMessage } from '@app/contexts/conversations/application/register-conversation/messages/RegisterConversationMessage';
import { ConversationWasCreatedEvent } from '@app/contexts/conversations/domain/events/ConversationWasCreatedEvent';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';
import Consumer from '@app/shared/infrastructure/ui/consumers/Consumer';

export default class RegisterConversationWhenAnnounced extends Consumer {
  public static QUEUE_NAME =
    'pigeon-swarm.register-conversation-when-announced';

  constructor(
    consumer: DomainEventConsumer,
    private readonly registrar: ConversationRegistrar,
  ) {
    super(consumer);
  }

  public get queueName(): string {
    return RegisterConversationWhenAnnounced.QUEUE_NAME;
  }

  public get eventName(): string {
    return ConversationWasCreatedEvent.EVENT_NAME;
  }

  public get domainEvent(): typeof DomainEvent {
    return ConversationWasCreatedEvent;
  }

  public get exchange(): string {
    return process.env.SERVICE_NAME || 'pigeon-swarm';
  }

  public async handler(event: DomainEvent): Promise<void> {
    await this.registrar.register(
      new RegisterConversationMessage({
        conversationId: event.aggregateId,
        name:
          typeof event.attributes.name === 'string'
            ? event.attributes.name
            : undefined,
        networkId: String(event.attributes.networkId),
        participantIds: Array.isArray(event.attributes.participantIds)
          ? event.attributes.participantIds.map(String)
          : [],
        type: String(event.attributes.type),
      }),
    );
  }
}
