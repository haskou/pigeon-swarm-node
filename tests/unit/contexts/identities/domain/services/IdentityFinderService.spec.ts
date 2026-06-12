import IdentityRepository from '@app/contexts/identities/domain/repositories/IdentityRepository';
import IdentityFinderService from '@app/contexts/identities/domain/services/IdentityFinderService';
import IdentityResolutionDomainService from '@app/contexts/identities/domain/services/IdentityResolutionDomainService';
import { IdentityExternalIdentifier } from '@app/contexts/identities/domain/value-objects/IdentityExternalIdentifier';
import { ProfileHandle } from '@app/contexts/identities/domain/value-objects/ProfileHandle';
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

  describe('findCandidateById', () => {
    it('should return the current identity candidate reference', async () => {
      const identity = await mother.build();
      const identityId = new IdentityId(identity.toPrimitives().id);
      const externalIdentifier = new IdentityExternalIdentifier(
        'bafyidentitycid',
      );

      repository.findCandidateReferencesById.mockResolvedValue([
        { externalIdentifier, identity },
      ]);

      const result = await service.findCandidateById(identityId);

      expect(repository.findCandidateReferencesById).toHaveBeenCalledWith(
        identityId,
      );
      expect(result.externalIdentifier).toEqual(externalIdentifier);
      expect(result.identity).toEqual(identity);
    });
  });

  describe('findCandidateByHandle', () => {
    it('should return the current candidate reference for the handle', async () => {
      const identity = await mother.build();
      const handle = new ProfileHandle('alice');
      const externalIdentifier = new IdentityExternalIdentifier(
        'bafyidentitycid',
      );

      repository.findCandidateByHandle.mockResolvedValue(
        { externalIdentifier, identity },
      );

      const result = await service.findCandidateByHandle(handle);

      expect(repository.findCandidateByHandle).toHaveBeenCalledWith(handle);
      expect(repository.findByHandle).not.toHaveBeenCalled();
      expect(repository.findCandidateReferencesById).not.toHaveBeenCalled();
      expect(result.externalIdentifier).toEqual(externalIdentifier);
    });
  });
});
