import DeviceAuthorizationProvisioner from '@app/contexts/identity-devices/application/provision/DeviceAuthorizationProvisioner';
import { DeviceAuthorizationProvisionMessage } from '@app/contexts/identity-devices/application/provision/messages/DeviceAuthorizationProvisionMessage';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { diag, diagSpan } from '@app/contexts/shared/infrastructure/diag/Diag';
import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';
import { assert } from '@haskou/value-objects';

import { InvalidIdentityCandidateError } from '../../domain/errors/InvalidIdentityCandidateError';
import { IdentityCandidate } from '../../domain/IdentityCandidate';
import IdentityRepository from '../../domain/repositories/IdentityRepository';
import IdentityCandidateValidationDomainService from '../../domain/services/IdentityCandidateValidationDomainService';
import IdentitySaverService from '../../domain/services/IdentitySaverService';
import { IdentityPublishMessage } from './messages/IdentityPublishMessage';

export default class IdentityPublisher {
  constructor(
    private readonly saver: IdentitySaverService,
    private readonly repository: IdentityRepository,
    private readonly validator: IdentityCandidateValidationDomainService,
    private readonly eventPublisher: DomainEventPublisher,
    private readonly deviceAuthorizationProvisioner: DeviceAuthorizationProvisioner,
  ) {}

  public async publish(
    message: IdentityPublishMessage,
  ): Promise<IdentityCandidate> {
    const identity = message.identity;
    const primitives = identity.toPrimitives();

    diag(`publish enter id=${primitives.id}`);
    const isValid = await diagSpan(
      `publish.isValidChainFor id=${primitives.id}`,
      () =>
        this.validator.isValidChainFor(
          new IdentityId(primitives.id),
          identity,
          (externalIdentifier) =>
            this.repository.findByExternalIdentifier(externalIdentifier),
        ),
      true,
    );

    if (!isValid) {
      throw new InvalidIdentityCandidateError();
    }

    const externalIdentifier = await diagSpan(
      `publish.calculateExternalIdentifier id=${primitives.id}`,
      () => this.saver.calculateExternalIdentifier(identity),
      true,
    );

    const provisionMessage = new DeviceAuthorizationProvisionMessage(
      new IdentityId(primitives.id),
      identity.getVersion(),
      externalIdentifier,
      identity.getNetworkIds(),
      identity.getInitialDeviceCredential(),
      identity.getRecoveryAuthority(),
    );

    await diagSpan(
      `publish.provision id=${primitives.id}`,
      () => this.deviceAuthorizationProvisioner.provision(provisionMessage),
      true,
    );

    try {
      const savedExternalIdentifier = await diagSpan(
        `publish.save id=${primitives.id}`,
        () => this.saver.save(identity),
        true,
      );

      assert(
        externalIdentifier.isEqual(savedExternalIdentifier),
        new InvalidIdentityCandidateError(),
      );
    } catch (error) {
      await this.deviceAuthorizationProvisioner.withdraw(provisionMessage);

      throw error;
    }

    const events = identity.pullDomainEvents();

    for (const event of events) {
      event.attributes.externalIdentifier = externalIdentifier.valueOf();
      event.attributes.deviceCredentialCommitment =
        primitives.deviceCredentialCommitment;
      event.attributes.handle = primitives.profile.handle;
      event.attributes.networkIds = primitives.networks;
      event.attributes.previousExternalIdentifier =
        primitives.previousIdentityExternalIdentifier;
      event.attributes.recoveryAuthority = primitives.recoveryAuthority;
      event.attributes.version = primitives.version;
    }

    await diagSpan(
      `publish.eventPublisher id=${primitives.id}`,
      () => this.eventPublisher.publish(events),
      true,
    );
    diag(`publish exit id=${primitives.id}`);

    return new IdentityCandidate(externalIdentifier, identity);
  }
}
