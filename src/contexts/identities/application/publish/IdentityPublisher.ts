import DeviceAuthorizationProvisioner from '@app/contexts/identity-devices/application/provision/DeviceAuthorizationProvisioner';
import { DeviceAuthorizationProvisionMessage } from '@app/contexts/identity-devices/application/provision/messages/DeviceAuthorizationProvisionMessage';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';
import { assert } from '@haskou/value-objects';

import { InsufficientIdentityAdmissionProofError } from '../../domain/errors/InsufficientIdentityAdmissionProofError';
import { InvalidIdentityCandidateError } from '../../domain/errors/InvalidIdentityCandidateError';
import { Identity } from '../../domain/Identity';
import { IdentityCandidate } from '../../domain/IdentityCandidate';
import IdentityAdmissionLoadRepository from '../../domain/repositories/IdentityAdmissionLoadRepository';
import IdentityRepository from '../../domain/repositories/IdentityRepository';
import IdentityCandidateValidationDomainService from '../../domain/services/IdentityCandidateValidationDomainService';
import IdentitySaverService from '../../domain/services/IdentitySaverService';
import { IdentityAdmissionDifficulty } from '../../domain/value-objects/IdentityAdmissionDifficulty';
import { IdentityPublishMessage } from './messages/IdentityPublishMessage';

export default class IdentityPublisher {
  constructor(
    private readonly saver: IdentitySaverService,
    private readonly repository: IdentityRepository,
    private readonly validator: IdentityCandidateValidationDomainService,
    private readonly eventPublisher: DomainEventPublisher,
    private readonly deviceAuthorizationProvisioner: DeviceAuthorizationProvisioner,
    private readonly admissionLoad: IdentityAdmissionLoadRepository,
  ) {}

  /** Networks this version enters for the first time: all of them for a genesis. */
  private async admittedNetworks(identity: Identity): Promise<NetworkId[]> {
    const previousReference = identity.getPreviousReference();

    if (!previousReference) {
      return identity.getNetworkIds();
    }

    // The chain was validated just before, so the previous version exists.
    const previous =
      await this.repository.requireByExternalIdentifier(previousReference);

    return identity.networksAddedSince(previous);
  }

  /**
   * Raises the proof this node asks of new admissions while their networks are
   * busy here. Updates that keep their networks reuse their proof unchanged.
   */
  private async assertAdmissionDifficulty(
    identity: Identity,
    admittedNetworks: NetworkId[],
  ): Promise<void> {
    let required = IdentityAdmissionDifficulty.floor();

    for (const networkId of admittedNetworks) {
      required = required.hardest(
        IdentityAdmissionDifficulty.forRecentAdmissions(
          await this.admissionLoad.countRecent(networkId),
        ),
      );
    }

    assert(
      identity.hasValidAdmissionProof(required),
      new InsufficientIdentityAdmissionProofError(required.valueOf()),
    );
  }

  public async publish(
    message: IdentityPublishMessage,
  ): Promise<IdentityCandidate> {
    const identity = message.identity;
    const primitives = identity.toPrimitives();
    const isValid = await this.validator.isValidChainFor(
      new IdentityId(primitives.id),
      identity,
      async (externalIdentifier) =>
        (await this.repository.hasByExternalIdentifier(externalIdentifier))
          ? this.repository.requireByExternalIdentifier(externalIdentifier)
          : undefined,
    );

    if (!isValid) {
      throw new InvalidIdentityCandidateError();
    }

    const admittedNetworks = await this.admittedNetworks(identity);

    await this.assertAdmissionDifficulty(identity, admittedNetworks);

    const externalIdentifier =
      await this.saver.calculateExternalIdentifier(identity);

    const provisionMessage = new DeviceAuthorizationProvisionMessage(
      new IdentityId(primitives.id),
      identity.getVersion(),
      externalIdentifier,
      identity.getNetworkIds(),
      identity.getInitialDeviceCredential(),
      identity.getRecoveryAuthority(),
    );

    await this.deviceAuthorizationProvisioner.provision(provisionMessage);

    try {
      const savedExternalIdentifier = await this.saver.save(identity);

      assert(
        externalIdentifier.isEqual(savedExternalIdentifier),
        new InvalidIdentityCandidateError(),
      );
    } catch (error) {
      await this.deviceAuthorizationProvisioner.withdraw(provisionMessage);

      throw error;
    }

    if (admittedNetworks.length > 0) {
      await this.admissionLoad.record(admittedNetworks);
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

    await this.eventPublisher.publish(events);

    return new IdentityCandidate(externalIdentifier, identity);
  }
}
