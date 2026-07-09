import { RegisterPublishedIdentityMessage } from '@app/contexts/identities/application/register-published/messages/RegisterPublishedIdentityMessage';
import RegisterPublishedIdentity from '@app/contexts/identities/application/register-published/RegisterPublishedIdentity';
import { IdentityWasUpdatedEvent } from '@app/contexts/identities/domain/events/IdentityWasUpdatedEvent';
import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';
import { DomainEventConsumer } from '@app/shared/infrastructure/messageBus/DomainEventConsumer';
import Consumer from '@haskou/ddd-kernel/adapters/pubsub';
import { DomainEvent } from '@haskou/ddd-kernel/domain';

export default class SynchronizeIdentityWhenUpdated extends Consumer {
  public static QUEUE_NAME = 'pigeon-swarm.synchronize-identity-when-updated';

  constructor(
    eventConsumer: DomainEventConsumer,
    private readonly registrar: RegisterPublishedIdentity,
  ) {
    super(eventConsumer);
  }

  public get queueName(): string {
    return SynchronizeIdentityWhenUpdated.QUEUE_NAME;
  }

  public get eventName(): string {
    return IdentityWasUpdatedEvent.EVENT_NAME;
  }

  public get domainEvent(): typeof DomainEvent {
    return IdentityWasUpdatedEvent;
  }

  public get exchange(): string {
    return pigeonEnvironment().SERVICE_NAME || 'pigeon-swarm';
  }

  public async handler(event: DomainEvent): Promise<void> {
    await this.registrar.register(
      new RegisterPublishedIdentityMessage(event.aggregateId),
    );
  }
}
