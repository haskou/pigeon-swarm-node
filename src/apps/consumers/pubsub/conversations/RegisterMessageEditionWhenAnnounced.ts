import ConversationMessageRegistrar from '@app/contexts/conversations/application/register-message/ConversationMessageRegistrar';
import { RegisterConversationMessage } from '@app/contexts/conversations/application/register-message/messages/RegisterConversationMessage';
import { ConversationMessageWasEditedEvent } from '@app/contexts/conversations/domain/events/ConversationMessageWasEditedEvent';
import Consumer from '@haskou/ddd-kernel/adapters/pubsub';
import { DomainEvent } from '@haskou/ddd-kernel/domain';
import { DomainEventConsumer } from '@haskou/ddd-kernel/domain';

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
