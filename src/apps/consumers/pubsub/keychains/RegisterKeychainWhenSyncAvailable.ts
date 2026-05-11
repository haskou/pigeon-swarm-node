import KeychainCandidateRegistrar from '@app/contexts/keychains/application/register-candidate/KeychainCandidateRegistrar';
import { RegisterKeychainCandidateMessage } from '@app/contexts/keychains/application/register-candidate/messages/RegisterKeychainCandidateMessage';
import { KeychainSyncAvailableEvent } from '@app/contexts/keychains/domain/events/KeychainSyncAvailableEvent';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';
import Consumer from '@app/shared/infrastructure/ui/consumers/Consumer';

export default class RegisterKeychainWhenSyncAvailable extends Consumer {
  public static QUEUE_NAME =
    'pigeon-swarm.register-keychain-when-sync-available';

  constructor(
    consumer: DomainEventConsumer,
    private readonly registrar: KeychainCandidateRegistrar,
  ) {
    super(consumer);
  }

  public get queueName(): string {
    return RegisterKeychainWhenSyncAvailable.QUEUE_NAME;
  }

  public get eventName(): string {
    return KeychainSyncAvailableEvent.EVENT_NAME;
  }

  public get domainEvent(): typeof DomainEvent {
    return KeychainSyncAvailableEvent;
  }

  public get exchange(): string {
    return process.env.SERVICE_NAME || 'pigeon-swarm';
  }

  public async handler(event: DomainEvent): Promise<void> {
    await this.registrar.register(
      new RegisterKeychainCandidateMessage(
        String(event.attributes.externalIdentifier),
      ),
    );
  }
}
