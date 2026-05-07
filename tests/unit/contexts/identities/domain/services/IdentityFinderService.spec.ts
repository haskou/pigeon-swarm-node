import { IdentityRepository } from '@app/contexts/identities/domain/repositories/IdentityRepository';
import IdentityFinderService from '@app/contexts/identities/domain/services/IdentityFinderService';
import { IdentityResolutionDomainService } from '@app/contexts/identities/domain/services/IdentityResolutionDomainService';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { mock, MockProxy } from 'jest-mock-extended';

import { IdentityMother } from '../../../../mothers/IdentityMother';

describe('IdentityFinderService', () => {
  let repository: MockProxy<IdentityRepository>;
  let service: IdentityFinderService;
  let mother: IdentityMother;

  beforeEach(() => {
    repository = mock<IdentityRepository>();
    service = new IdentityFinderService(
      repository,
      new IdentityResolutionDomainService(),
    );
    mother = new IdentityMother();
  });

  describe('findById', () => {
    it('should return the identity from the repository', async () => {
      const identity = await mother.build();
      const identityId = new IdentityId(identity.toPrimitives().id);
      repository.findCandidatesById.mockResolvedValue([identity]);

      const result = await service.findById(identityId);

      expect(repository.findCandidatesById).toHaveBeenCalledWith(identityId);
      expect(result).toEqual(identity);
    });

    it('should propagate repository errors', async () => {
      const identity = await mother.build();
      const identityId = new IdentityId(identity.toPrimitives().id);
      const error = new Error('not found');
      repository.findCandidatesById.mockRejectedValue(error);

      await expect(service.findById(identityId)).rejects.toThrow('not found');
    });
  });
});
