import ConversationRegistrar from '@app/contexts/conversations/application/register-conversation/ConversationRegistrar';
import { RegisterConversationMessage } from '@app/contexts/conversations/application/register-conversation/messages/RegisterConversationMessage';
import { ConversationWasCreatedEvent } from '@app/contexts/conversations/domain/events/ConversationWasCreatedEvent';
import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';
import { DomainEventConsumer } from '@app/shared/infrastructure/messageBus/DomainEventConsumer';
import Consumer from '@haskou/ddd-kernel/adapters/pubsub';
import { DomainEvent } from '@haskou/ddd-kernel/domain';

type ConversationAnnouncementAttributes = {
  name?: string;
  networkId: string;
  participantIds: string[];
  type: string;
};

export default class RegisterConversationWhenAnnounced extends Consumer {
  public static QUEUE_NAME =
    'pigeon-swarm.register-conversation-when-announced';

  constructor(
    eventConsumer: DomainEventConsumer,
    private readonly registrar: ConversationRegistrar,
  ) {
    super(eventConsumer);
  }

  public get queueName(): string {
    return RegisterConversationWhenAnnounced.QUEUE_NAME;
  }

  public get eventName(): string {
    return ConversationWasCreatedEvent.EVENT_NAME;
  }

  public get domainEvent(): typeof DomainEvent {
    return ConversationWasCreatedEvent;
  }

  public get exchange(): string {
    return pigeonEnvironment().SERVICE_NAME || 'pigeon-swarm';
  }

  private getAttributes(
    event: DomainEvent,
  ): ConversationAnnouncementAttributes {
    const attributes = event.attributes;
    const name = attributes.name;
    const networkId = attributes.networkId;
    const participantIds = attributes.participantIds;
    const type = attributes.type;

    if (
      typeof networkId === 'string' &&
      typeof type === 'string' &&
      Array.isArray(participantIds) &&
      participantIds.every(
        (participantId) => typeof participantId === 'string',
      ) &&
      (name === undefined || typeof name === 'string')
    ) {
      const validatedAttributes = {
        networkId,
        participantIds,
        type,
      };

      return typeof name === 'string'
        ? {
            ...validatedAttributes,
            name,
          }
        : validatedAttributes;
    }

    throw new Error('Invalid conversation announcement.');
  }

  public async handler(event: DomainEvent): Promise<void> {
    const attributes = this.getAttributes(event);

    await this.registrar.register(
      new RegisterConversationMessage({
        conversationId: event.aggregateId,
        ...attributes,
      }),
    );
  }
}
