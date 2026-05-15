import MessageReactionRegistrar from '@app/contexts/conversations/application/register-reaction/MessageReactionRegistrar';
import { RegisterMessageReaction } from '@app/contexts/conversations/application/register-reaction/messages/RegisterMessageReaction';
import { ConversationMessageReactionWasRemovedEvent } from '@app/contexts/conversations/domain/events/ConversationMessageReactionWasRemovedEvent';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';
import Consumer from '@app/shared/infrastructure/ui/consumers/Consumer';

export default class RegisterMessageReactionWhenRemoved extends Consumer {
  public static QUEUE_NAME =
    'pigeon-swarm.register-message-reaction-when-removed';

  constructor(
    consumer: DomainEventConsumer,
    private readonly registrar: MessageReactionRegistrar,
  ) {
    super(consumer);
  }

  public get queueName(): string {
    return RegisterMessageReactionWhenRemoved.QUEUE_NAME;
  }

  public get eventName(): string {
    return ConversationMessageReactionWasRemovedEvent.EVENT_NAME;
  }

  public get domainEvent(): typeof DomainEvent {
    return ConversationMessageReactionWasRemovedEvent;
  }

  public get exchange(): string {
    return process.env.SERVICE_NAME || 'pigeon-swarm';
  }

  public async handler(event: DomainEvent): Promise<void> {
    await this.registrar.unregister(
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
