import IdentityFinder from '@app/contexts/identities/application/find/IdentityFinder';
import { IdentityFinderMessage } from '@app/contexts/identities/application/find/messages/IdentityFinderMessage';
import IdentityFinderService from '@app/contexts/identities/domain/services/IdentityFinderService';
import { mock, MockProxy } from 'jest-mock-extended';

import { IdentityMother } from '../../../../mothers/IdentityMother';

describe('IdentityFinder', () => {
  let finderService: MockProxy<IdentityFinderService>;
  let finder: IdentityFinder;
  let mother: IdentityMother;

  beforeEach(() => {
    finderService = mock<IdentityFinderService>();
    finder = new IdentityFinder(finderService);
    mother = new IdentityMother();
  });

  describe('find', () => {
    it('should return the identity from the finder service', async () => {
      const identity = await mother.build();
      const primitives = identity.toPrimitives();
      const message = new IdentityFinderMessage(primitives.id);

      finderService.findById.mockResolvedValue(identity);

      const result = await finder.find(message);

      expect(finderService.findById).toHaveBeenCalledWith(message.identityId);
      expect(result).toEqual(identity);
    });

    it('should propagate errors from the finder service', async () => {
      const identity = await mother.build();
      const primitives = identity.toPrimitives();
      const message = new IdentityFinderMessage(primitives.id);
      const error = new Error('not found');

      finderService.findById.mockRejectedValue(error);

      await expect(finder.find(message)).rejects.toThrow('not found');
    });
  });
});
