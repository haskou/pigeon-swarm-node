import { Identity } from '@app/contexts/identities/domain/Identity';
import { IdentityNotFoundError } from '@app/contexts/identities/domain/errors/IdentityNotFoundError';
import IdentityResolutionDomainService from '@app/contexts/identities/domain/services/IdentityResolutionDomainService';
import { IdentityVersion } from '@app/contexts/identities/domain/value-objects/IdentityVersion';

import { IdentityMother } from '../../../../mothers/IdentityMother';

describe('IdentityResolutionDomainService', () => {
  let mother: IdentityMother;
  let service: IdentityResolutionDomainService;

  beforeEach(() => {
    mother = new IdentityMother();
    service = new IdentityResolutionDomainService();
  });

  async function buildIdentityWithVersion(
    version: IdentityVersion,
  ): Promise<Identity> {
    return mother.buildNext({
      previousIdentityExternalIdentifier: version.isFirst()
        ? undefined
        : 'bafypreviousidentity',
      version: version.valueOf(),
    });
  }

  it('should resolve the highest version candidate', async () => {
    const oldIdentity = await buildIdentityWithVersion(new IdentityVersion(1));
    const currentIdentity = await buildIdentityWithVersion(
      new IdentityVersion(2),
    );

    const result = service.resolve(mother.id, [oldIdentity, currentIdentity]);

    expect(result.toPrimitives().version).toBe(2);
  });

  it('should throw when there are no matching candidates', () => {
    expect(() => service.resolve(mother.id, [])).toThrow(IdentityNotFoundError);
  });
});
