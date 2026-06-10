import IdentityRepository from '@app/contexts/identities/domain/repositories/IdentityRepository';
import { InvalidKeychainCandidateError } from '@app/contexts/keychains/domain/errors/InvalidKeychainCandidateError';
import { KeychainOwnerNetworksNotFoundError } from '@app/contexts/keychains/domain/errors/KeychainOwnerNetworksNotFoundError';
import { Keychain } from '@app/contexts/keychains/domain/Keychain';
import KeychainRepository from '@app/contexts/keychains/domain/repositories/KeychainRepository';
import KeychainCandidateValidationDomainService from '@app/contexts/keychains/domain/services/KeychainCandidateValidationDomainService';
import KeychainSaverService from '@app/contexts/keychains/domain/services/KeychainSaverService';
import { KeychainExternalIdentifier } from '@app/contexts/keychains/domain/value-objects/KeychainExternalIdentifier';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';

import { KeychainPublishMessage } from './messages/KeychainPublishMessage';

export default class KeychainPublisher {
  constructor(
    private readonly saver: KeychainSaverService,
    private readonly repository: KeychainRepository,
    private readonly validator: KeychainCandidateValidationDomainService,
    private readonly eventPublisher: DomainEventPublisher,
    private readonly identityRepository: IdentityRepository,
  ) {}

  private async findOwnerNetworkIds(
    ownerIdentityId: IdentityId,
  ): Promise<NetworkId[]> {
    const identity = await this.identityRepository.findById(ownerIdentityId);
    const networkIds = identity
      .toPrimitives()
      .networks.map((networkId) => new NetworkId(networkId));

    if (networkIds.length === 0) {
      throw new KeychainOwnerNetworksNotFoundError();
    }

    return networkIds;
  }

  public async publish(
    message: KeychainPublishMessage,
  ): Promise<KeychainExternalIdentifier> {
    const keychain = Keychain.publish(message.toKeychainPrimitives());
    const isValid = await this.validator.isValidChainFor(
      message.ownerIdentityId,
      keychain,
      (externalIdentifier) =>
        this.repository.findByExternalIdentifier(externalIdentifier),
    );

    if (!isValid) {
      throw new InvalidKeychainCandidateError();
    }

    const networkIds = await this.findOwnerNetworkIds(message.ownerIdentityId);
    const externalIdentifier = await this.saver.save(keychain, networkIds);
    const events = keychain.pullDomainEvents();

    for (const event of events) {
      event.attributes.externalIdentifier = externalIdentifier.valueOf();
      event.attributes.networkIds = networkIds.map((networkId) =>
        networkId.valueOf(),
      );
      event.attributes.previousExternalIdentifier =
        keychain.toPrimitives().previousKeychainExternalIdentifier;
      event.attributes.version = keychain.toPrimitives().version;
    }

    await this.eventPublisher.publish(events);

    return externalIdentifier;
  }
}
