import CurrentKeychainFinder from '@app/contexts/keychains/application/find-current/CurrentKeychainFinder';
import { CurrentKeychainFindMessage } from '@app/contexts/keychains/application/find-current/messages/CurrentKeychainFindMessage';
import { KeychainWasPublishedEvent } from '@app/contexts/keychains/domain/events/KeychainWasPublishedEvent';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';
import Consumer from '@app/shared/infrastructure/ui/consumers/Consumer';

export default class RegisterKeychainWhenPublished extends Consumer {
  public static QUEUE_NAME = 'pigeon-swarm.register-keychain-when-published';

  constructor(
    consumer: DomainEventConsumer,
    private readonly finder: CurrentKeychainFinder,
  ) {
    super(consumer);
  }

  public get queueName(): string {
    return RegisterKeychainWhenPublished.QUEUE_NAME;
  }

  public get eventName(): string {
    return KeychainWasPublishedEvent.EVENT_NAME;
  }

  public get domainEvent(): typeof DomainEvent {
    return KeychainWasPublishedEvent;
  }

  public get exchange(): string {
    return process.env.SERVICE_NAME || 'pigeon-swarm';
  }

  public async handler(event: DomainEvent): Promise<void> {
    await this.finder.find(new CurrentKeychainFindMessage(event.aggregateId));
  }
}
