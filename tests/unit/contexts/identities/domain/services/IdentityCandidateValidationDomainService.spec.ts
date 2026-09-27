import { Profile } from '@app/contexts/identities/domain/Profile';
import IdentityCandidateValidationDomainService from '@app/contexts/identities/domain/services/IdentityCandidateValidationDomainService';
import { IdentityExternalIdentifier } from '@app/contexts/identities/domain/value-objects/IdentityExternalIdentifier';
import { ProfileName } from '@app/contexts/identities/domain/value-objects/ProfileName';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { faker } from '@faker-js/faker';

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
    const candidate = await mother.buildNext({
      previousIdentityExternalIdentifier: previousReference.valueOf(),
      profile: new Profile(new ProfileName('Jane')).toPrimitives(),
    });

    const result = await service.isValidChainFor(mother.id, candidate, () =>
      Promise.resolve(previousIdentity),
    );

    expect(result).toBe(true);
  });

  it('should reject a versioned candidate without its previous identity', async () => {
    const previousIdentity = mother.build();
    const candidate = await mother.buildNext({
      previousIdentityExternalIdentifier: 'bafyunknownidentity',
      profile: new Profile(new ProfileName('Jane')).toPrimitives(),
    });

    const result = await service.isValidChainFor(mother.id, candidate, () =>
      Promise.resolve(undefined),
    );

    expect(result).toBe(false);
  });

  it('should reject a versioned candidate that removes a previous network', async () => {
    const previousIdentity = mother.build();
    const candidate = await mother.buildNext({
      networks: [new NetworkId(faker.string.uuid()).valueOf()],
      previousIdentityExternalIdentifier: 'bafypreviousidentity',
    });

    const result = await service.isValidChainFor(mother.id, candidate, () =>
      Promise.resolve(previousIdentity),
    );

    expect(result).toBe(false);
  });
});
