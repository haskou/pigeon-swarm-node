import { IdentityRepository } from '@app/contexts/identities/domain/repositories/IdentityRepository';
import IdentityRegistrarService from '@app/contexts/identities/domain/services/IdentityRegistrarService';
import { IdentityResolutionDomainService } from '@app/contexts/identities/domain/services/IdentityResolutionDomainService';
import { mock, MockProxy } from 'jest-mock-extended';

import { IdentityMother } from '../../../../mothers/IdentityMother';

describe('IdentityRegistrarService', () => {
  let repository: MockProxy<IdentityRepository>;
  let service: IdentityRegistrarService;
  let mother: IdentityMother;

  beforeEach(() => {
    repository = mock<IdentityRepository>();
    service = new IdentityRegistrarService(
      repository,
      new IdentityResolutionDomainService(),
    );
    mother = new IdentityMother();
  });

  it('should register the latest valid candidate locally', async () => {
    const identity = mother.build();

    repository.findCandidatesById.mockResolvedValue([identity]);

    const result = await service.register(mother.id);

    expect(repository.findCandidatesById).toHaveBeenCalledWith(mother.id);
    expect(result).toEqual(identity);
  });
});
