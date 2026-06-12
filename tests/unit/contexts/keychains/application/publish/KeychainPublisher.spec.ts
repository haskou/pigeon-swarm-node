import { Identity } from '@app/contexts/identities/domain/Identity';
import IdentityRepository from '@app/contexts/identities/domain/repositories/IdentityRepository';
import KeychainPublisher from '@app/contexts/keychains/application/publish/KeychainPublisher';
import { KeychainPublishMessage } from '@app/contexts/keychains/application/publish/messages/KeychainPublishMessage';
import { InvalidKeychainCandidateError } from '@app/contexts/keychains/domain/errors/InvalidKeychainCandidateError';
import { Keychain } from '@app/contexts/keychains/domain/Keychain';
import KeychainRepository from '@app/contexts/keychains/domain/repositories/KeychainRepository';
import KeychainCandidateValidationDomainService from '@app/contexts/keychains/domain/services/KeychainCandidateValidationDomainService';
import KeychainSaverService from '@app/contexts/keychains/domain/services/KeychainSaverService';
import { KeychainExternalIdentifier } from '@app/contexts/keychains/domain/value-objects/KeychainExternalIdentifier';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';
import { UUID } from '@haskou/value-objects';
import { mock, MockProxy } from 'jest-mock-extended';

import { KeychainMother } from '../../../../mothers/KeychainMother';

describe('KeychainPublisher', () => {
  let eventPublisher: MockProxy<DomainEventPublisher>;
  let identityRepository: MockProxy<IdentityRepository>;
  let repository: MockProxy<KeychainRepository>;
  let saver: MockProxy<KeychainSaverService>;
  let validator: MockProxy<KeychainCandidateValidationDomainService>;
  let publisher: KeychainPublisher;

  beforeEach(() => {
    eventPublisher = mock<DomainEventPublisher>();
    identityRepository = mock<IdentityRepository>();
    repository = mock<KeychainRepository>();
    saver = mock<KeychainSaverService>();
    validator = mock<KeychainCandidateValidationDomainService>();
    publisher = new KeychainPublisher(
      saver,
      repository,
      validator,
      eventPublisher,
      identityRepository,
    );
  });

  function mockOwnerIdentity(networkIds: NetworkId[]): Identity {
    return {
      toPrimitives: () => ({
        encryptedKeyPair: {
          encryptedPrivateKey: 'encrypted-private-key',
          publicKey: 'public-key',
        },
        id: 'identity-id',
        networks: networkIds.map((networkId) => networkId.valueOf()),
        previousIdentityExternalIdentifier: undefined,
        profile: {
          biography: undefined,
          handle: undefined,
          name: 'Alice',
          picture: undefined,
        },
        signature: 'signature',
        timestamp: 1,
        version: 1,
      }),
    } as Identity;
  }

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
    identityRepository.findById.mockResolvedValue(
      mockOwnerIdentity([new NetworkId(UUID.generate().toString())]),
    );
    saver.save.mockResolvedValue(externalIdentifier);
    eventPublisher.publish.mockResolvedValue(undefined);

    const result = await publisher.publish(message);

    expect(result).toBe(externalIdentifier);
    expect(saver.save).toHaveBeenCalledWith(
      expect.any(Keychain),
      expect.arrayContaining([expect.any(NetworkId)]),
    );
    expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
    expect(eventPublisher.publish.mock.calls[0][0][0].attributes).toEqual(
      expect.objectContaining({
        encryptedPayload: primitives.encryptedPayload,
        externalIdentifier: externalIdentifier.valueOf(),
        previousExternalIdentifier:
          primitives.previousKeychainExternalIdentifier,
        signature: primitives.signature,
        timestamp: primitives.timestamp,
        version: primitives.version,
      }),
    );
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
