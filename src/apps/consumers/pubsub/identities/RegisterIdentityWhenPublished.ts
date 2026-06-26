import { RegisterPublishedIdentityMessage } from '@app/contexts/identities/application/register-published/messages/RegisterPublishedIdentityMessage';
import RegisterPublishedIdentity from '@app/contexts/identities/application/register-published/RegisterPublishedIdentity';
import { IdentityWasCreatedEvent } from '@app/contexts/identities/domain/events/IdentityWasCreatedEvent';
import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';
import Consumer from '@haskou/ddd-kernel/adapters/pubsub';
import { DomainEvent } from '@haskou/ddd-kernel/domain';
import { DomainEventConsumer } from '@haskou/ddd-kernel/domain';

export default class RegisterIdentityWhenPublished extends Consumer {
  public static QUEUE_NAME = 'pigeon-swarm.register-identity-when-published';

  constructor(
    private readonly eventConsumer: DomainEventConsumer,
    private readonly registrar: RegisterPublishedIdentity,
  ) {
    super(eventConsumer);
  }

  public get queueName(): string {
    return RegisterIdentityWhenPublished.QUEUE_NAME;
  }

  public get eventName(): string {
    return IdentityWasCreatedEvent.EVENT_NAME;
  }

  public get domainEvent(): typeof DomainEvent {
    return IdentityWasCreatedEvent;
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
