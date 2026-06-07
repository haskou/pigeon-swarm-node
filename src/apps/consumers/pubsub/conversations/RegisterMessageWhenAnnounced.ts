import ConversationRegistrar from '@app/contexts/conversations/application/register-conversation/ConversationRegistrar';
import ConversationMessageRegistrar from '@app/contexts/conversations/application/register-message/ConversationMessageRegistrar';
import { RegisterConversationMessage } from '@app/contexts/conversations/application/register-message/messages/RegisterConversationMessage';
import { ConversationMessageWasSentEvent } from '@app/contexts/conversations/domain/events/ConversationMessageWasSentEvent';
import { Message } from '@app/contexts/conversations/domain/Message';
import { MessageFactory } from '@app/contexts/conversations/domain/MessageFactory';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';
import Consumer from '@app/shared/infrastructure/ui/consumers/Consumer';
import { PrimitiveOf } from '@haskou/value-objects';

export default class RegisterMessageWhenAnnounced extends Consumer {
  public static QUEUE_NAME = 'pigeon-swarm.register-message-when-announced';

  constructor(
    consumer: DomainEventConsumer,
    private readonly registrar: ConversationMessageRegistrar,
    _conversationRegistrar: ConversationRegistrar,
  ) {
    super(consumer);
    void _conversationRegistrar;
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

  private messageCandidateFrom(event: DomainEvent): Message | undefined {
    const candidate = event.attributes.message;

    if (
      candidate === undefined ||
      candidate === null ||
      typeof candidate !== 'object' ||
      Array.isArray(candidate)
    ) {
      return undefined;
    }

    return MessageFactory.fromPrimitives(candidate as PrimitiveOf<Message>);
  }

  private async registerMessage(
    message: RegisterConversationMessage,
    candidate: Message | undefined,
  ): Promise<void> {
    if (candidate === undefined) {
      await this.registrar.register(message);

      return;
    }

    await this.registrar.registerCandidate(message, candidate);
  }

  public async handler(event: DomainEvent): Promise<void> {
    const message = new RegisterConversationMessage(
      event.aggregateId,
      String(event.attributes.messageId),
    );

    await this.registerMessage(message, this.messageCandidateFrom(event));
  }
}
