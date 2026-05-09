import KeychainPublisher from '@app/contexts/keychains/application/publish/KeychainPublisher';
import { KeychainPublishMessage } from '@app/contexts/keychains/application/publish/messages/KeychainPublishMessage';
import { InvalidKeychainCandidateError } from '@app/contexts/keychains/domain/errors/InvalidKeychainCandidateError';
import { KeychainRepository } from '@app/contexts/keychains/domain/repositories/KeychainRepository';
import { KeychainCandidateValidationDomainService } from '@app/contexts/keychains/domain/services/KeychainCandidateValidationDomainService';
import KeychainSaverService from '@app/contexts/keychains/domain/services/KeychainSaverService';
import { KeychainExternalIdentifier } from '@app/contexts/keychains/domain/value-objects/KeychainExternalIdentifier';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';
import { mock, MockProxy } from 'jest-mock-extended';

import { KeychainMother } from '../../../../mothers/KeychainMother';

describe('KeychainPublisher', () => {
  let eventPublisher: MockProxy<DomainEventPublisher>;
  let repository: MockProxy<KeychainRepository>;
  let saver: MockProxy<KeychainSaverService>;
  let validator: MockProxy<KeychainCandidateValidationDomainService>;
  let publisher: KeychainPublisher;

  beforeEach(() => {
    eventPublisher = mock<DomainEventPublisher>();
    repository = mock<KeychainRepository>();
    saver = mock<KeychainSaverService>();
    validator = mock<KeychainCandidateValidationDomainService>();
    publisher = new KeychainPublisher(
      saver,
      repository,
      validator,
      eventPublisher,
    );
  });

  it('should publish a valid encrypted keychain version', async () => {
    const externalIdentifier = new KeychainExternalIdentifier('bafy-keychain');
    const primitives = (await KeychainMother.create()).primitives();
    const message = new KeychainPublishMessage(
      primitives.ownerIdentityId,
      primitives.encryptedPayload,
      primitives.timestamp,
      primitives.signature,
      primitives.version,
      primitives.previousKeychainExternalIdentifier,
    );

    validator.isValidChainFor.mockResolvedValue(true);
    saver.save.mockResolvedValue(externalIdentifier);
    eventPublisher.publish.mockResolvedValue(undefined);

    const result = await publisher.publish(message);

    expect(result).toBe(externalIdentifier);
    expect(saver.save).toHaveBeenCalledTimes(1);
    expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
  });

  it('should reject invalid keychain candidates', async () => {
    const primitives = (await KeychainMother.create()).primitives();
    const message = new KeychainPublishMessage(
      primitives.ownerIdentityId,
      primitives.encryptedPayload,
      primitives.timestamp,
      primitives.signature,
      primitives.version,
      primitives.previousKeychainExternalIdentifier,
    );

    validator.isValidChainFor.mockResolvedValue(false);

    await expect(publisher.publish(message)).rejects.toThrow(
      InvalidKeychainCandidateError,
    );
    expect(saver.save).not.toHaveBeenCalled();
    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });
});
