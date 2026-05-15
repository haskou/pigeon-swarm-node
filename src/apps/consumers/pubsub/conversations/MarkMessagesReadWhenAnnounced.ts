import { MessagesReadMarkMessage } from '@app/contexts/conversations/application/mark-messages-read/messages/MessagesReadMarkMessage';
import MessagesReadRegistrar from '@app/contexts/conversations/application/mark-messages-read/MessagesReadRegistrar';
import { ConversationMessagesWereReadEvent } from '@app/contexts/conversations/domain/events/ConversationMessagesWereReadEvent';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';
import Consumer from '@app/shared/infrastructure/ui/consumers/Consumer';

export default class MarkMessagesReadWhenAnnounced extends Consumer {
  public static QUEUE_NAME = 'pigeon-swarm.mark-messages-read-when-announced';

  constructor(
    consumer: DomainEventConsumer,
    private readonly registrar: MessagesReadRegistrar,
  ) {
    super(consumer);
  }

  public get domainEvent(): typeof DomainEvent {
    return ConversationMessagesWereReadEvent;
  }

  public get eventName(): string {
    return ConversationMessagesWereReadEvent.EVENT_NAME;
  }

  public get exchange(): string {
    return process.env.SERVICE_NAME || 'pigeon-swarm';
  }

  public async handler(event: DomainEvent): Promise<void> {
    await this.registrar.register(
      new MessagesReadMarkMessage(
        event.aggregateId,
        String(event.attributes.readerIdentityId),
        String(event.attributes.messageId),
      ),
    );
  }

  public get queueName(): string {
    return MarkMessagesReadWhenAnnounced.QUEUE_NAME;
  }
}
