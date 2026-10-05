import ConversationMessageRegistrar from '@app/contexts/conversations/application/register-message/ConversationMessageRegistrar';
import { RegisterConversationMessage } from '@app/contexts/conversations/application/register-message/messages/RegisterConversationMessage';
import { ConversationMessageWasEditedEvent } from '@app/contexts/conversations/domain/events/ConversationMessageWasEditedEvent';
import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import { StalePublicMutationError } from '@app/contexts/public-mutations/domain/errors/StalePublicMutationError';
import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';
import { DomainEventConsumer } from '@app/shared/infrastructure/messageBus/DomainEventConsumer';
import Consumer from '@haskou/ddd-kernel/adapters/pubsub';
import { DomainEvent } from '@haskou/ddd-kernel/domain';

export default class RegisterMessageEditionWhenAnnounced extends Consumer {
  public static QUEUE_NAME =
    'pigeon-swarm.register-message-edition-when-announced';

  constructor(
    eventConsumer: DomainEventConsumer,
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
    return pigeonEnvironment().SERVICE_NAME || 'pigeon-swarm';
  }

  public async handler(event: DomainEvent): Promise<void> {
    try {
      await this.registrar.register(
        new RegisterConversationMessage(
          event.aggregateId,
          String(event.attributes.messageId),
          event.attributes.mutationProof,
        ),
      );
    } catch (error) {
      if (error instanceof InvalidPublicMutationError) return;

      if (error instanceof StalePublicMutationError) return;

      throw error;
    }
  }
}
