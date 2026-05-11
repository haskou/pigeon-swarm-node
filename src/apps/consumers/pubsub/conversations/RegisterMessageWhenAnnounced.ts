import ConversationMessageRegistrar from '@app/contexts/conversations/application/register-message/ConversationMessageRegistrar';
import { RegisterConversationMessage } from '@app/contexts/conversations/application/register-message/messages/RegisterConversationMessage';
import { ConversationMessageWasSentEvent } from '@app/contexts/conversations/domain/events/ConversationMessageWasSentEvent';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';
import Consumer from '@app/shared/infrastructure/ui/consumers/Consumer';

export default class RegisterMessageWhenAnnounced extends Consumer {
  public static QUEUE_NAME = 'pigeon-swarm.register-message-when-announced';

  constructor(
    consumer: DomainEventConsumer,
    private readonly registrar: ConversationMessageRegistrar,
  ) {
    super(consumer);
  }

  public get queueName(): string {
    return RegisterMessageWhenAnnounced.QUEUE_NAME;
  }

  public get eventName(): string {
    return ConversationMessageWasSentEvent.EVENT_NAME;
  }

  public get domainEvent(): typeof DomainEvent {
    return ConversationMessageWasSentEvent;
  }

  public get exchange(): string {
    return process.env.SERVICE_NAME || 'pigeon-swarm';
  }

  public async handler(event: DomainEvent): Promise<void> {
    await this.registrar.register(
      new RegisterConversationMessage(
        event.aggregateId,
        String(event.attributes.messageId),
      ),
    );
  }
}
