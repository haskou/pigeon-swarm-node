import ConversationRegistrar from '@app/contexts/conversations/application/register-conversation/ConversationRegistrar';
import { ConversationWasCreatedEvent } from '@app/contexts/conversations/domain/events/ConversationWasCreatedEvent';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';
import Consumer from '@app/shared/infrastructure/ui/consumers/Consumer';

export default class RegisterConversationWhenAnnounced extends Consumer {
  public static QUEUE_NAME =
    'pigeon-swarm.register-conversation-when-announced';

  constructor(
    consumer: DomainEventConsumer,
    _registrar: ConversationRegistrar,
  ) {
    super(consumer);
    void _registrar;
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

  public handler(_event: DomainEvent): Promise<void> {
    void _event;

    return Promise.resolve();
  }
}
