import IdentityCandidateRegistrar from '@app/contexts/identities/application/register-candidate/IdentityCandidateRegistrar';
import { RegisterIdentityCandidateMessage } from '@app/contexts/identities/application/register-candidate/messages/RegisterIdentityCandidateMessage';
import { IdentitySyncAvailableEvent } from '@app/contexts/identities/domain/events/IdentitySyncAvailableEvent';
import SyncResponseSuppressionTracker from '@app/contexts/shared/application/sync/SyncResponseSuppressionTracker';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';
import Consumer from '@app/shared/infrastructure/ui/consumers/Consumer';

export default class RegisterIdentityWhenSyncAvailable extends Consumer {
  public static QUEUE_NAME =
    'pigeon-swarm.register-identity-when-sync-available';

  constructor(
    consumer: DomainEventConsumer,
    private readonly registrar: IdentityCandidateRegistrar,
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
    this.tracker.markAvailable(
      'identity',
      String(event.attributes.identityId || event.aggregateId),
      event.attributes.requestId
        ? String(event.attributes.requestId)
        : undefined,
    );

    await this.registrar.register(
      new RegisterIdentityCandidateMessage(
        String(event.attributes.externalIdentifier),
      ),
    );
  }
}
