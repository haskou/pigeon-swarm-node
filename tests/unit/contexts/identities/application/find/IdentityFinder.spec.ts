import IdentityFinder from '@app/contexts/identities/application/find/IdentityFinder';
import { IdentityFinderMessage } from '@app/contexts/identities/application/find/messages/IdentityFinderMessage';
import IdentityFinderService from '@app/contexts/identities/domain/services/IdentityFinderService';
import { IdentityExternalIdentifier } from '@app/contexts/identities/domain/value-objects/IdentityExternalIdentifier';
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

  describe('findCandidate', () => {
    it('should return the current identity candidate from the finder service', async () => {
      const identity = await mother.build();
      const primitives = identity.toPrimitives();
      const message = new IdentityFinderMessage(primitives.id);
      const externalIdentifier = new IdentityExternalIdentifier(
        'bafyidentitycid',
      );

      finderService.findCandidateById.mockResolvedValue({
        externalIdentifier,
        identity,
      });

      const result = await finder.findCandidate(message);

      expect(finderService.findCandidateById).toHaveBeenCalledWith(
        message.identityId,
      );
      expect(result.externalIdentifier).toEqual(externalIdentifier);
      expect(result.identity).toEqual(identity);
    });
  });
});
