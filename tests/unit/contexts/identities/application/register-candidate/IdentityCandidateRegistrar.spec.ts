import IdentityCandidateRegistrar from '@app/contexts/identities/application/register-candidate/IdentityCandidateRegistrar';
import { RegisterIdentityCandidateMessage } from '@app/contexts/identities/application/register-candidate/messages/RegisterIdentityCandidateMessage';
import IdentityRepository from '@app/contexts/identities/domain/repositories/IdentityRepository';
import { mock, MockProxy } from 'jest-mock-extended';

import { IdentityMother } from '../../../../mothers/IdentityMother';

describe('IdentityCandidateRegistrar', () => {
  let repository: MockProxy<IdentityRepository>;
  let registrar: IdentityCandidateRegistrar;

  beforeEach(() => {
    repository = mock<IdentityRepository>();
    registrar = new IdentityCandidateRegistrar(repository);
  });

  it('should register the candidate identified by the publication event', async () => {
    const identity = new IdentityMother();
    const message = new RegisterIdentityCandidateMessage(
      identity.id.valueOf(),
      'bafy-published-identity',
    );

    await registrar.register(message);

    expect(repository.findCandidateByExternalIdentifier).toHaveBeenCalledWith(
      message.identityId,
      message.externalIdentifier,
    );
  });
});
