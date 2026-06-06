import IdentityCandidateRegistrar from '@app/contexts/identities/application/register-candidate/IdentityCandidateRegistrar';
import { RegisterIdentityCandidateMessage } from '@app/contexts/identities/application/register-candidate/messages/RegisterIdentityCandidateMessage';
import { IdentitySyncAvailableEvent } from '@app/contexts/identities/domain/events/IdentitySyncAvailableEvent';
import { KeychainSyncRequestedEvent } from '@app/contexts/keychains/domain/events/KeychainSyncRequestedEvent';
import SyncResponseSuppressionTracker from '@app/contexts/shared/application/sync/SyncResponseSuppressionTracker';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';
import Consumer from '@app/shared/infrastructure/ui/consumers/Consumer';

export default class RegisterIdentityWhenSyncAvailable extends Consumer {
  public static QUEUE_NAME =
    'pigeon-swarm.register-identity-when-sync-available';

  constructor(
    consumer: DomainEventConsumer,
    private readonly registrar: IdentityCandidateRegistrar,
    private readonly eventPublisher: DomainEventPublisher,
    private readonly tracker = SyncResponseSuppressionTracker.shared(),
  ) {
    super(consumer);
  }

  public get queueName(): string {
    return RegisterIdentityWhenSyncAvailable.QUEUE_NAME;
  }

  public get eventName(): string {
    return IdentitySyncAvailableEvent.EVENT_NAME;
  }

  public get domainEvent(): typeof DomainEvent {
    return IdentitySyncAvailableEvent;
  }

  public get exchange(): string {
    return process.env.SERVICE_NAME || 'pigeon-swarm';
  }

  public async handler(event: DomainEvent): Promise<void> {
    const identityId = String(event.attributes.identityId || event.aggregateId);
    const requestId = event.attributes.requestId
      ? String(event.attributes.requestId)
      : undefined;
    const networkId =
      typeof event.attributes.networkId === 'string'
        ? event.attributes.networkId
        : undefined;

    this.tracker.markAvailable('identity', identityId, requestId);

    await this.registrar.register(
      new RegisterIdentityCandidateMessage(
        String(event.attributes.externalIdentifier),
      ),
    );
    await this.eventPublisher.publish([
      new KeychainSyncRequestedEvent(identityId, {
        networkId,
        ownerIdentityId: identityId,
        requestId,
      }),
    ]);
  }
}
