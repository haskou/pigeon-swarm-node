import IdentityCandidateRegistrar from '@app/contexts/identities/application/register-candidate/IdentityCandidateRegistrar';
import { RegisterIdentityCandidateMessage } from '@app/contexts/identities/application/register-candidate/messages/RegisterIdentityCandidateMessage';
import { IdentityWasUpdatedEvent } from '@app/contexts/identities/domain/events/IdentityWasUpdatedEvent';
import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';
import { DomainEventConsumer } from '@app/shared/infrastructure/messageBus/DomainEventConsumer';
import Consumer from '@haskou/ddd-kernel/adapters/pubsub';
import { DomainEvent } from '@haskou/ddd-kernel/domain';

export default class SynchronizeIdentityWhenUpdated extends Consumer {
  public static QUEUE_NAME = 'pigeon-swarm.synchronize-identity-when-updated';

  constructor(
    eventConsumer: DomainEventConsumer,
    private readonly registrar: IdentityCandidateRegistrar,
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
    const externalIdentifier = event.attributes.externalIdentifier;

    if (typeof externalIdentifier !== 'string') {
      throw new Error('Identity publication external identifier is required.');
    }

    await this.registrar.register(
      new RegisterIdentityCandidateMessage(
        event.aggregateId,
        externalIdentifier,
      ),
    );
  }
}
