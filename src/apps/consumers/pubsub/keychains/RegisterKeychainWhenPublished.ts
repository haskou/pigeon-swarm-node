import CurrentKeychainFinder from '@app/contexts/keychains/application/find-current/CurrentKeychainFinder';
import { CurrentKeychainFindMessage } from '@app/contexts/keychains/application/find-current/messages/CurrentKeychainFindMessage';
import { KeychainWasPublishedEvent } from '@app/contexts/keychains/domain/events/KeychainWasPublishedEvent';
import Consumer from '@app/shared/infrastructure/ui/consumers/Consumer';
import { DomainEvent } from '@haskou/ddd-kernel/domain';
import { DomainEventConsumer } from '@haskou/ddd-kernel/domain';

export default class RegisterKeychainWhenPublished extends Consumer {
  public static QUEUE_NAME = 'pigeon-swarm.register-keychain-when-published';

  constructor(
    private readonly eventConsumer: DomainEventConsumer,
    private readonly finder: CurrentKeychainFinder,
  ) {
    super(eventConsumer);
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
