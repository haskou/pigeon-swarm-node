import { pigeonEnvironment } from '@app/apps/PigeonEnvironment';
import MessageReactionRegistrar from '@app/contexts/conversations/application/register-reaction/MessageReactionRegistrar';
import { RegisterMessageReaction } from '@app/contexts/conversations/application/register-reaction/messages/RegisterMessageReaction';
import { ConversationMessageReactionWasAddedEvent } from '@app/contexts/conversations/domain/events/ConversationMessageReactionWasAddedEvent';
import Consumer from '@haskou/ddd-kernel/adapters/pubsub';
import { DomainEvent } from '@haskou/ddd-kernel/domain';
import { DomainEventConsumer } from '@haskou/ddd-kernel/domain';

export default class RegisterMessageReactionWhenAdded extends Consumer {
  public static QUEUE_NAME =
    'pigeon-swarm.register-message-reaction-when-added';

  constructor(
    private readonly eventConsumer: DomainEventConsumer,
    private readonly registrar: MessageReactionRegistrar,
  ) {
    super(eventConsumer);
  }

  public get queueName(): string {
    return RegisterMessageReactionWhenAdded.QUEUE_NAME;
  }

  public get eventName(): string {
    return ConversationMessageReactionWasAddedEvent.EVENT_NAME;
  }

  public get domainEvent(): typeof DomainEvent {
    return ConversationMessageReactionWasAddedEvent;
  }

  public get exchange(): string {
    return pigeonEnvironment().SERVICE_NAME || 'pigeon-swarm';
  }

  public async handler(event: DomainEvent): Promise<void> {
    await this.registrar.register(
      new RegisterMessageReaction(
        event.aggregateId,
        String(event.attributes.messageId),
        String(event.attributes.authorId),
        String(event.attributes.emoji),
        Number(event.attributes.createdAt),
      ),
    );
  }
}
