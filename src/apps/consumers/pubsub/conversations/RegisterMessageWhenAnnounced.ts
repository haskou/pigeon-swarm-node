import ConversationRegistrar from '@app/contexts/conversations/application/register-conversation/ConversationRegistrar';
import { RegisterConversationMessage as RegisterConversationMetadataMessage } from '@app/contexts/conversations/application/register-conversation/messages/RegisterConversationMessage';
import ConversationMessageRegistrar from '@app/contexts/conversations/application/register-message/ConversationMessageRegistrar';
import { RegisterConversationMessage } from '@app/contexts/conversations/application/register-message/messages/RegisterConversationMessage';
import { ConversationNotFoundError } from '@app/contexts/conversations/domain/errors/ConversationNotFoundError';
import { ConversationMessageWasSentEvent } from '@app/contexts/conversations/domain/events/ConversationMessageWasSentEvent';
import { Message } from '@app/contexts/conversations/domain/Message';
import { MessageFactory } from '@app/contexts/conversations/domain/MessageFactory';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';
import Consumer from '@app/shared/infrastructure/ui/consumers/Consumer';
import { PrimitiveOf } from '@haskou/value-objects';

export default class RegisterMessageWhenAnnounced extends Consumer {
  private static readonly REGISTER_RETRY_DELAY_MS = 500;
  private static readonly REGISTER_RETRY_LIMIT = 20;
  public static QUEUE_NAME = 'pigeon-swarm.register-message-when-announced';

  constructor(
    consumer: DomainEventConsumer,
    private readonly registrar: ConversationMessageRegistrar,
    private readonly conversationRegistrar: ConversationRegistrar,
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

  private async waitBeforeRetry(attempt: number): Promise<void> {
    if (attempt === 0) {
      return;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, RegisterMessageWhenAnnounced.REGISTER_RETRY_DELAY_MS);
    });
  }

  private async registerConversationMetadata(
    event: DomainEvent,
  ): Promise<void> {
    await this.conversationRegistrar.register(
      new RegisterConversationMetadataMessage({
        conversationId: event.aggregateId,
        name:
          typeof event.attributes.conversationName === 'string'
            ? event.attributes.conversationName
            : undefined,
        networkId: String(event.attributes.networkId),
        participantIds: Array.isArray(event.attributes.participantIds)
          ? event.attributes.participantIds.map(String)
          : [],
        type: String(event.attributes.conversationType),
      }),
    );
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
    const candidate = this.messageCandidateFrom(event);
    let metadataRegistered = false;

    for (
      let attempt = 0;
      attempt <= RegisterMessageWhenAnnounced.REGISTER_RETRY_LIMIT;
      attempt += 1
    ) {
      try {
        await this.registerMessage(message, candidate);

        return;
      } catch (error) {
        if (
          !(error instanceof ConversationNotFoundError) ||
          attempt === RegisterMessageWhenAnnounced.REGISTER_RETRY_LIMIT
        ) {
          throw error;
        }

        if (!metadataRegistered) {
          await this.registerConversationMetadata(event);
          metadataRegistered = true;
        }

        await this.waitBeforeRetry(attempt);
      }
    }
  }
}
