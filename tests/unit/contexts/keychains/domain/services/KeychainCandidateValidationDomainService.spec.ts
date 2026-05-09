import { KeychainCandidateValidationDomainService } from '@app/contexts/keychains/domain/services/KeychainCandidateValidationDomainService';

import { KeychainMother } from '../../../../mothers/KeychainMother';

describe('KeychainCandidateValidationDomainService', () => {
  let service: KeychainCandidateValidationDomainService;

  beforeEach(() => {
    service = new KeychainCandidateValidationDomainService();
  });

  it('should accept a valid first keychain version', async () => {
    const mother = await KeychainMother.create();

    await expect(
      service.isValidChainFor(
        mother.ownerIdentityId,
        mother.build(),
        async () => undefined,
      ),
    ).resolves.toBe(true);
  });

  it('should reject a keychain for another owner', async () => {
    const mother = await KeychainMother.create();
    const other = await KeychainMother.create();

    await expect(
      service.isValidChainFor(
        other.ownerIdentityId,
        mother.build(),
        async () => undefined,
      ),
    ).resolves.toBe(false);
  });

  it('should accept a valid next version with a valid previous keychain', async () => {
    const mother = await KeychainMother.create();
    const previous = mother.build();
    const next = mother
      .withVersion(2)
      .withPreviousKeychainExternalIdentifier('bafy-previous')
      .build();

    await expect(
      service.isValidChainFor(mother.ownerIdentityId, next, async () => previous),
    ).resolves.toBe(true);
  });
});
