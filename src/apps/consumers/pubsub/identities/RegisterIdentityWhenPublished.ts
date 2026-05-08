import IdentityFinder from '@app/contexts/identities/application/find/IdentityFinder';
import { IdentityFinderMessage } from '@app/contexts/identities/application/find/messages/IdentityFinderMessage';
import { IdentityWasCreatedEvent } from '@app/contexts/identities/domain/events/IdentityWasCreatedEvent';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';
import Consumer from '@app/shared/infrastructure/ui/consumers/Consumer';

export default class RegisterIdentityWhenPublished extends Consumer {
  public static QUEUE_NAME = 'pigeon-swarm.register-identity-when-published';

  constructor(
    consumer: DomainEventConsumer,
    private readonly finder: IdentityFinder,
  ) {
    super(consumer);
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
    return process.env.SERVICE_NAME || 'pigeon-swarm';
  }

  public async handler(event: DomainEvent): Promise<void> {
    await this.finder.find(new IdentityFinderMessage(event.aggregateId));
  }
}
