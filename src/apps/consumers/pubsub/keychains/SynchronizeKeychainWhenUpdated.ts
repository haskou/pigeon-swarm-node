import CurrentKeychainFinder from '@app/contexts/keychains/application/find-current/CurrentKeychainFinder';
import { CurrentKeychainFindMessage } from '@app/contexts/keychains/application/find-current/messages/CurrentKeychainFindMessage';
import { KeychainWasPublishedEvent } from '@app/contexts/keychains/domain/events/KeychainWasPublishedEvent';
import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';
import Consumer from '@haskou/ddd-kernel/adapters/pubsub';
import { DomainEvent } from '@haskou/ddd-kernel/domain';
import { DomainEventConsumer } from '@haskou/ddd-kernel/domain';

export default class SynchronizeKeychainWhenUpdated extends Consumer {
  public static QUEUE_NAME = 'pigeon-swarm.synchronize-keychain-when-updated';

  constructor(
    private readonly eventConsumer: DomainEventConsumer,
    private readonly finder: CurrentKeychainFinder,
  ) {
    super(eventConsumer);
  }

  public get queueName(): string {
    return SynchronizeKeychainWhenUpdated.QUEUE_NAME;
  }

  public get eventName(): string {
    return KeychainWasPublishedEvent.EVENT_NAME;
  }

  public get domainEvent(): typeof DomainEvent {
    return KeychainWasPublishedEvent;
  }

  public get exchange(): string {
    return pigeonEnvironment().SERVICE_NAME || 'pigeon-swarm';
  }

  public async handler(event: DomainEvent): Promise<void> {
    await this.finder.find(new CurrentKeychainFindMessage(event.aggregateId));
  }
}
