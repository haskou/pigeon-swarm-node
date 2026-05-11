import CurrentKeychainFinder from '@app/contexts/keychains/application/find-current/CurrentKeychainFinder';
import { CurrentKeychainFindMessage } from '@app/contexts/keychains/application/find-current/messages/CurrentKeychainFindMessage';
import { KeychainNotFoundError } from '@app/contexts/keychains/domain/errors/KeychainNotFoundError';
import { KeychainRepository } from '@app/contexts/keychains/domain/repositories/KeychainRepository';
import { KeychainCandidateValidationDomainService } from '@app/contexts/keychains/domain/services/KeychainCandidateValidationDomainService';
import { mock, MockProxy } from 'jest-mock-extended';

import { IdentityMother } from '../../../../mothers/IdentityMother';

describe('CurrentKeychainFinder', () => {
  let repository: MockProxy<KeychainRepository>;
  let validator: MockProxy<KeychainCandidateValidationDomainService>;
  let finder: CurrentKeychainFinder;

  beforeEach(() => {
    repository = mock<KeychainRepository>();
    validator = mock<KeychainCandidateValidationDomainService>();
    finder = new CurrentKeychainFinder(repository, validator);
  });

  it('should throw keychain not found when the identity has no valid keychain candidates', async () => {
    const ownerIdentityId = new IdentityMother().id.valueOf();

    repository.findCandidateReferencesByOwnerId.mockResolvedValue([]);

    await expect(
      finder.find(new CurrentKeychainFindMessage(ownerIdentityId)),
    ).rejects.toThrow(KeychainNotFoundError);
  });
});
