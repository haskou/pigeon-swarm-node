import IdentityRepository from '@app/contexts/identities/domain/repositories/IdentityRepository';
import IdentitySaverService from '@app/contexts/identities/domain/services/IdentitySaverService';
import { IdentityExternalIdentifier } from '@app/contexts/identities/domain/value-objects/IdentityExternalIdentifier';
import { mock, MockProxy } from 'jest-mock-extended';

import { IdentityMother } from '../../../../mothers/IdentityMother';

describe('IdentitySaverService', () => {
  let repository: MockProxy<IdentityRepository>;
  let service: IdentitySaverService;
  let mother: IdentityMother;

  beforeEach(() => {
    repository = mock<IdentityRepository>();
    service = new IdentitySaverService(repository);
    mother = new IdentityMother();
  });

  describe('save', () => {
    it('should save the identity through the repository', async () => {
      const identity = await mother.build();
      const externalIdentifier = new IdentityExternalIdentifier('bafkidentity');
      repository.save.mockResolvedValue(externalIdentifier);

      const result = await service.save(identity);

      expect(repository.save).toHaveBeenCalledWith(identity);
      expect(result.isEqual(externalIdentifier)).toBe(true);
    });

    it('should propagate repository errors', async () => {
      const identity = await mother.build();
      const error = new Error('save failed');
      repository.save.mockRejectedValue(error);

      await expect(service.save(identity)).rejects.toThrow('save failed');
    });
  });
});
