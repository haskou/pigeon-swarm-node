import { IdentityCandidateValidationDomainService } from '@app/contexts/identities/domain/services/IdentityCandidateValidationDomainService';
import { IdentityExternalIdentifier } from '@app/contexts/identities/domain/value-objects/IdentityExternalIdentifier';
import { Profile } from '@app/contexts/identities/domain/Profile';
import { ProfileName } from '@app/contexts/identities/domain/value-objects/ProfileName';

import { IdentityMother } from '../../../../mothers/IdentityMother';

describe('IdentityCandidateValidationDomainService', () => {
  let mother: IdentityMother;
  let service: IdentityCandidateValidationDomainService;

  beforeEach(() => {
    mother = new IdentityMother();
    service = new IdentityCandidateValidationDomainService();
  });

  it('should accept a versioned candidate with a valid previous chain', async () => {
    const previousIdentity = mother.build();
    const previousReference = new IdentityExternalIdentifier(
      'bafypreviousidentity',
    );
    const candidate = await previousIdentity.updateProfile(
      new Profile(new ProfileName('Jane')),
      mother.password,
      previousReference,
    );

    const result = await service.isValidChainFor(
      mother.id,
      candidate,
      async () => previousIdentity,
    );

    expect(result).toBe(true);
  });

  it('should reject a versioned candidate without its previous identity', async () => {
    const previousIdentity = mother.build();
    const candidate = await previousIdentity.updateProfile(
      new Profile(new ProfileName('Jane')),
      mother.password,
      new IdentityExternalIdentifier('bafyunknownidentity'),
    );

    const result = await service.isValidChainFor(
      mother.id,
      candidate,
      async () => undefined,
    );

    expect(result).toBe(false);
  });
});
