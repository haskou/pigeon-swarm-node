import { MessagesReadMarkMessage } from '@app/contexts/conversations/application/mark-messages-read/messages/MessagesReadMarkMessage';
import MessagesReadRegistrar from '@app/contexts/conversations/application/mark-messages-read/MessagesReadRegistrar';
import { ConversationMessagesWereReadEvent } from '@app/contexts/conversations/domain/events/ConversationMessagesWereReadEvent';
import { MessageReadProof } from '@app/contexts/conversations/domain/value-objects/MessageReadProof';
import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';
import { DomainEventConsumer } from '@app/shared/infrastructure/messageBus/DomainEventConsumer';
import { networkFanoutSuppression } from '@app/shared/infrastructure/messageBus/NetworkFanoutSuppression';
import Consumer from '@haskou/ddd-kernel/adapters/pubsub';
import { DomainEvent } from '@haskou/ddd-kernel/domain';

export default class MarkMessagesReadWhenAnnounced extends Consumer {
  public static QUEUE_NAME = 'pigeon-swarm.mark-messages-read-when-announced';

  constructor(
    eventConsumer: DomainEventConsumer,
    private readonly registrar: MessagesReadRegistrar,
  ) {
    super(eventConsumer);
  }

  public get domainEvent(): typeof DomainEvent {
    return ConversationMessagesWereReadEvent;
  }

  public get eventName(): string {
    return ConversationMessagesWereReadEvent.EVENT_NAME;
  }

  public get exchange(): string {
    return pigeonEnvironment().SERVICE_NAME || 'pigeon-swarm';
  }

  public async handler(event: DomainEvent): Promise<void> {
    const conversationId = event.aggregateId;
    const readerIdentityId = String(event.attributes.readerIdentityId);
    const messageId = String(event.attributes.messageId);
    const readProof = event.attributes.readProof;

    if (
      !MessageReadProof.isReceivable(readProof, {
        conversationId,
        messageId,
        readerIdentityId,
      })
    ) {
      return;
    }

    const accepted = await this.registrar.register(
      new MessagesReadMarkMessage(
        conversationId,
        readerIdentityId,
        messageId,
        readProof,
      ),
    );

    // The store refused this marker as stale. Keep the receipt off the WebSocket
    // fanout that runs after the handlers. Duplicates and unknown messages still fan out.
    if (!accepted) {
      networkFanoutSuppression.add(event);
    }
  }

  public get queueName(): string {
    return MarkMessagesReadWhenAnnounced.QUEUE_NAME;
  }
}
