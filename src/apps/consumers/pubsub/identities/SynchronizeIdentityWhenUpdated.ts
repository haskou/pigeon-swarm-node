import { RegisterPublishedIdentityMessage } from '@app/contexts/identities/application/register-published/messages/RegisterPublishedIdentityMessage';
import RegisterPublishedIdentity from '@app/contexts/identities/application/register-published/RegisterPublishedIdentity';
import { IdentityWasUpdatedEvent } from '@app/contexts/identities/domain/events/IdentityWasUpdatedEvent';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';
import Consumer from '@app/shared/infrastructure/ui/consumers/Consumer';

export default class SynchronizeIdentityWhenUpdated extends Consumer {
  public static QUEUE_NAME = 'pigeon-swarm.synchronize-identity-when-updated';

  constructor(
    consumer: DomainEventConsumer,
    private readonly registrar: RegisterPublishedIdentity,
  ) {
    super(consumer);
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
    return process.env.SERVICE_NAME || 'pigeon-swarm';
  }

  public async handler(event: DomainEvent): Promise<void> {
    await this.registrar.register(
      new RegisterPublishedIdentityMessage(event.aggregateId),
    );
  }
}
