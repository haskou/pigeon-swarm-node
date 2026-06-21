import { IdentitySignatureDomainService } from '@app/contexts/identities/domain/domain-services/IdentitySignatureDomainService';
import { Identity } from '@app/contexts/identities/domain/Identity';
import { IdentitySignaturePayload } from '@app/contexts/identities/domain/IdentitySignaturePayload';
import { Profile } from '@app/contexts/identities/domain/Profile';
import IdentityCandidateValidationDomainService from '@app/contexts/identities/domain/services/IdentityCandidateValidationDomainService';
import { IdentityExternalIdentifier } from '@app/contexts/identities/domain/value-objects/IdentityExternalIdentifier';
import { IdentitySigningKey } from '@app/contexts/identities/domain/value-objects/IdentitySigningKey';
import { ProfileName } from '@app/contexts/identities/domain/value-objects/ProfileName';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { faker } from '@faker-js/faker';
import { EncryptedKeyPair } from '@haskou/value-objects';

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
      () => Promise.resolve(previousIdentity),
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
      () => Promise.resolve(undefined),
    );

    expect(result).toBe(false);
  });

  it('should reject a versioned candidate that removes a previous network', async () => {
    const previousIdentity = mother.build();
    const previousPrimitives = previousIdentity.toPrimitives();
    const { signature: _, ...candidatePrimitives } = {
      ...previousPrimitives,
      networks: [new NetworkId(faker.string.uuid()).valueOf()],
      previousIdentityExternalIdentifier: 'bafypreviousidentity',
      signature: '',
      timestamp: previousPrimitives.timestamp + 1,
      version: previousPrimitives.version + 1,
    };
    const signature =
      await new IdentitySignatureDomainService().generateSignature(
        IdentitySignaturePayload.fromPrimitives(candidatePrimitives),
        IdentitySigningKey.fromPrimitives(previousPrimitives.encryptedKeyPair),
        mother.password,
      );
    const candidate = Identity.fromPrimitives({
      ...candidatePrimitives,
      signature: signature.valueOf(),
    });

    const result = await service.isValidChainFor(
      mother.id,
      candidate,
      () => Promise.resolve(previousIdentity),
    );

    expect(result).toBe(false);
  });
});
