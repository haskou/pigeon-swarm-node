import ConversationMessageRegistrar from '@app/contexts/conversations/application/register-message/ConversationMessageRegistrar';
import { RegisterConversationMessage } from '@app/contexts/conversations/application/register-message/messages/RegisterConversationMessage';
import { Message } from '@app/contexts/conversations/domain/entities/messages/Message';
import { MessageFactory } from '@app/contexts/conversations/domain/entities/messages/MessageFactory';
import { ConversationMessageWasSentEvent } from '@app/contexts/conversations/domain/events/ConversationMessageWasSentEvent';
import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';
import { DomainEventConsumer } from '@app/shared/infrastructure/messageBus/DomainEventConsumer';
import Consumer from '@haskou/ddd-kernel/adapters/pubsub';
import { DomainEvent } from '@haskou/ddd-kernel/domain';
import { PrimitiveOf } from '@haskou/value-objects';

export default class RegisterMessageWhenAnnounced extends Consumer {
  private static readonly REQUIRED_MESSAGE_STRING_FIELDS = [
    'authorId',
    'conversationId',
    'id',
    'signature',
    'type',
  ];

  public static QUEUE_NAME = 'pigeon-swarm.register-message-when-announced';

  constructor(
    eventConsumer: DomainEventConsumer,
    private readonly registrar: ConversationMessageRegistrar,
  ) {
    super(eventConsumer);
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
    return pigeonEnvironment().SERVICE_NAME || 'pigeon-swarm';
  }

  private isStringArray(value: unknown): value is string[] {
    return (
      Array.isArray(value) && value.every((item) => typeof item === 'string')
    );
  }

  private hasRequiredStringFields(value: object): boolean {
    return RegisterMessageWhenAnnounced.REQUIRED_MESSAGE_STRING_FIELDS.every(
      (field) => typeof Reflect.get(value, field) === 'string',
    );
  }

  private isMessageCandidate(value: unknown): value is PrimitiveOf<Message> {
    if (
      value === undefined ||
      value === null ||
      typeof value !== 'object' ||
      Array.isArray(value)
    ) {
      return false;
    }

    return (
      this.hasRequiredStringFields(value) &&
      typeof Reflect.get(value, 'createdAt') === 'number' &&
      this.isStringArray(Reflect.get(value, 'previousMessageIds'))
    );
  }

  private messageCandidateFrom(event: DomainEvent): Message | undefined {
    const candidate = event.attributes.message;

    if (!this.isMessageCandidate(candidate)) {
      return undefined;
    }

    return MessageFactory.fromPrimitives(candidate);
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
