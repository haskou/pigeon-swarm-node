import { InvalidKeychainCandidateError } from '@app/contexts/keychains/domain/errors/InvalidKeychainCandidateError';
import { Keychain } from '@app/contexts/keychains/domain/Keychain';
import { KeychainRepository } from '@app/contexts/keychains/domain/repositories/KeychainRepository';
import { KeychainCandidateValidationDomainService } from '@app/contexts/keychains/domain/services/KeychainCandidateValidationDomainService';
import KeychainSaverService from '@app/contexts/keychains/domain/services/KeychainSaverService';
import { KeychainExternalIdentifier } from '@app/contexts/keychains/domain/value-objects/KeychainExternalIdentifier';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';

import { KeychainPublishMessage } from './messages/KeychainPublishMessage';

export default class KeychainPublisher {
  constructor(
    private readonly saver: KeychainSaverService,
    private readonly repository: KeychainRepository,
    private readonly validator: KeychainCandidateValidationDomainService,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

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

    const externalIdentifier = await this.saver.save(keychain);

    await this.eventPublisher.publish(keychain.pullDomainEvents());

    return externalIdentifier;
  }
}
