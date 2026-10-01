import { IdentityWasCreatedEvent } from '@app/contexts/identities/domain/events/IdentityWasCreatedEvent';
import IdentityRepository from '@app/contexts/identities/domain/repositories/IdentityRepository';
import { IdentityExternalIdentifier } from '@app/contexts/identities/domain/value-objects/IdentityExternalIdentifier';
import DeviceAuthorizationProvisioner from '@app/contexts/identity-devices/application/provision/DeviceAuthorizationProvisioner';
import { DeviceAuthorizationProvisionMessage } from '@app/contexts/identity-devices/application/provision/messages/DeviceAuthorizationProvisionMessage';
import { InvalidDeviceAuthorizationTransitionError } from '@app/contexts/identity-devices/domain/errors/InvalidDeviceAuthorizationTransitionError';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';
import { DomainEventConsumer } from '@app/shared/infrastructure/messageBus/DomainEventConsumer';
import Consumer from '@haskou/ddd-kernel/adapters/pubsub';
import { DomainEvent } from '@haskou/ddd-kernel/domain';
import { assert } from '@haskou/value-objects';

export default class ProvisionDeviceAuthorizationWhenIdentityCreated extends Consumer {
  public static QUEUE_NAME =
    'pigeon-swarm.provision-device-authorization-when-identity-created';

  public constructor(
    eventConsumer: DomainEventConsumer,
    private readonly provisioner: DeviceAuthorizationProvisioner,
    private readonly identityRepository: IdentityRepository,
  ) {
    super(eventConsumer);
  }

  public get queueName(): string {
    return ProvisionDeviceAuthorizationWhenIdentityCreated.QUEUE_NAME;
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
    const { externalIdentifier } = event.attributes;

    assert(
      typeof externalIdentifier === 'string',
      new InvalidDeviceAuthorizationTransitionError(),
    );
    const identityId = new IdentityId(event.aggregateId);
    const candidate =
      await this.identityRepository.findCandidateByExternalIdentifier(
        identityId,
        new IdentityExternalIdentifier(externalIdentifier),
      );
    const identity = candidate.getIdentity();

    assert(
      identity.isFirstVersion() && identity.isIdentifiedBy(identityId),
      new InvalidDeviceAuthorizationTransitionError(),
    );

    await this.provisioner.provision(
      new DeviceAuthorizationProvisionMessage(
        identityId,
        identity.getVersion(),
        candidate.getExternalIdentifier(),
        identity.getNetworkIds(),
        identity.getInitialDeviceCredential(),
        identity.getRecoveryAuthority(),
      ),
    );
  }
}
