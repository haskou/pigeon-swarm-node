import { IdentitySignatureDomainService } from '@app/contexts/identities/domain/domain-services/IdentitySignatureDomainService';
import { Identity } from '@app/contexts/identities/domain/Identity';
import { IdentitySignaturePayload } from '@app/contexts/identities/domain/IdentitySignaturePayload';
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
    const primitives = mother.build().toPrimitives();
    const { signature: _, ...nextPrimitives } = {
      ...primitives,
      signature: '',
      version: version.valueOf(),
    };
    const signature =
      await new IdentitySignatureDomainService().generateSignature(
        IdentitySignaturePayload.fromPrimitives(nextPrimitives),
        mother.encryptedKeyPair,
        mother.password,
      );

    return Identity.fromPrimitives({
      ...nextPrimitives,
      signature: signature.valueOf(),
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
