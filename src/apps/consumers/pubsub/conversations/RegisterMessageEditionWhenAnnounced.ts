import ConversationMessageRegistrar from '@app/contexts/conversations/application/register-message/ConversationMessageRegistrar';
import { RegisterConversationMessage } from '@app/contexts/conversations/application/register-message/messages/RegisterConversationMessage';
import { ConversationMessageWasEditedEvent } from '@app/contexts/conversations/domain/events/ConversationMessageWasEditedEvent';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';
import Consumer from '@app/shared/infrastructure/ui/consumers/Consumer';

export default class RegisterMessageEditionWhenAnnounced extends Consumer {
  public static QUEUE_NAME =
    'pigeon-swarm.register-message-edition-when-announced';

  constructor(
    private readonly eventConsumer: DomainEventConsumer,
    private readonly registrar: ConversationMessageRegistrar,
  ) {
    super(eventConsumer);
  }

  public get queueName(): string {
    return RegisterMessageEditionWhenAnnounced.QUEUE_NAME;
  }

  public get eventName(): string {
    return ConversationMessageWasEditedEvent.EVENT_NAME;
  }

  public get domainEvent(): typeof DomainEvent {
    return ConversationMessageWasEditedEvent;
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
