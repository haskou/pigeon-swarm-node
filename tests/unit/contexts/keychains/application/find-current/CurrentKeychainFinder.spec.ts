import CurrentKeychainFinder from '@app/contexts/keychains/application/find-current/CurrentKeychainFinder';
import { CurrentKeychainFindMessage } from '@app/contexts/keychains/application/find-current/messages/CurrentKeychainFindMessage';
import { KeychainNotFoundError } from '@app/contexts/keychains/domain/errors/KeychainNotFoundError';
import { KeychainCandidate } from '@app/contexts/keychains/domain/KeychainCandidate';
import KeychainRepository from '@app/contexts/keychains/domain/repositories/KeychainRepository';
import KeychainCandidateValidationDomainService from '@app/contexts/keychains/domain/services/KeychainCandidateValidationDomainService';
import KeychainSignatureDomainService from '@app/contexts/keychains/domain/services/KeychainSignatureDomainService';
import { KeychainExternalIdentifier } from '@app/contexts/keychains/domain/value-objects/KeychainExternalIdentifier';
import { mock, MockProxy } from 'jest-mock-extended';

import { IdentityMother } from '../../../../mothers/IdentityMother';
import { KeychainMother } from '../../../../mothers/KeychainMother';

describe('CurrentKeychainFinder', () => {
  let repository: MockProxy<KeychainRepository>;
  let validator: MockProxy<KeychainCandidateValidationDomainService>;
  let signatureService: MockProxy<KeychainSignatureDomainService>;
  let finder: CurrentKeychainFinder;

  beforeEach(() => {
    repository = mock<KeychainRepository>();
    validator = mock<KeychainCandidateValidationDomainService>();
    signatureService = mock<KeychainSignatureDomainService>();
    signatureService.isValidSignature.mockReturnValue(true);
    finder = new CurrentKeychainFinder(repository, validator, signatureService);
  });

  it('should throw keychain not found when the identity has no valid keychain candidates', async () => {
    const ownerIdentityId = new IdentityMother().id.valueOf();

    repository.findCandidateReferencesByOwnerId.mockResolvedValue([]);

    await expect(
      finder.find(new CurrentKeychainFindMessage(ownerIdentityId)),
    ).rejects.toThrow(KeychainNotFoundError);
  });

  it('should validate local metadata candidates without resolving previous keychains', async () => {
    const mother = await KeychainMother.create();
    const keychain = mother
      .withVersion(2)
      .withPreviousKeychainExternalIdentifier('bafy-previous')
      .build();

    repository.findCandidateReferencesByOwnerId.mockResolvedValue([
      KeychainCandidate.localCandidate(
        new KeychainExternalIdentifier('bafy-current'),
        keychain,
      ),
    ]);

    const result = await finder.find(
      new CurrentKeychainFindMessage(mother.ownerIdentityId.valueOf()),
    );

    expect(result.getKeychain()).toEqual(keychain);
    expect(validator.isValidChainFor).not.toHaveBeenCalled();
    expect(repository.hasByExternalIdentifier).not.toHaveBeenCalled();
    expect(repository.requireByExternalIdentifier).not.toHaveBeenCalled();
  });

  it.each([
    ['larger identifier first', ['bafy-z-current', 'bafy-a-current']],
    ['smaller identifier first', ['bafy-a-current', 'bafy-z-current']],
  ])(
    'should pick the smaller external identifier on a version tie with the %s',
    async (_order, identifiers) => {
      const mother = await KeychainMother.create();
      const keychain = mother
        .withVersion(2)
        .withPreviousKeychainExternalIdentifier('bafy-previous')
        .build();

      repository.findCandidateReferencesByOwnerId.mockResolvedValue(
        identifiers.map((identifier) =>
          KeychainCandidate.localCandidate(
            new KeychainExternalIdentifier(identifier),
            keychain,
          ),
        ),
      );

      const result = await finder.find(
        new CurrentKeychainFindMessage(mother.ownerIdentityId.valueOf()),
      );

      expect(result.getExternalIdentifier().valueOf()).toBe('bafy-a-current');
    },
  );

  it('should prefer a newer version over a smaller external identifier', async () => {
    const mother = await KeychainMother.create();
    const older = mother.withVersion(2).build();
    const newer = mother.withVersion(3).build();

    repository.findCandidateReferencesByOwnerId.mockResolvedValue([
      KeychainCandidate.localCandidate(
        new KeychainExternalIdentifier('bafy-a-older'),
        older,
      ),
      KeychainCandidate.localCandidate(
        new KeychainExternalIdentifier('bafy-z-newer'),
        newer,
      ),
    ]);

    const result = await finder.find(
      new CurrentKeychainFindMessage(mother.ownerIdentityId.valueOf()),
    );

    expect(result.getExternalIdentifier().valueOf()).toBe('bafy-z-newer');
  });
});
