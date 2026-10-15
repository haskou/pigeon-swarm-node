import IdentityCreationDetector from '@app/contexts/identities/application/detect-creation/IdentityCreationDetector';
import { IdentityCreationDetectorMessage } from '@app/contexts/identities/application/detect-creation/messages/IdentityCreationDetectorMessage';
import { Identity } from '@app/contexts/identities/domain/Identity';
import IdentityRepository from '@app/contexts/identities/domain/repositories/IdentityRepository';
import { IdentityExternalIdentifier } from '@app/contexts/identities/domain/value-objects/IdentityExternalIdentifier';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { mock, MockProxy } from 'jest-mock-extended';

describe('IdentityCreationDetector', () => {
  const id = new IdentityId(
    'MCowBQYDK2VwAyEAFuQGsm0WcnE4FhQecwAFGeTfQCZzEMuhE73CyTUxOio=',
  );
  let repository: MockProxy<IdentityRepository>;
  let detector: IdentityCreationDetector;

  const identity = (hasPreviousReference: boolean): Identity => {
    const candidate = mock<Identity>();

    candidate.getId.mockReturnValue(id);
    candidate.hasNoPreviousReference.mockReturnValue(!hasPreviousReference);

    return candidate;
  };

  beforeEach(() => {
    repository = mock<IdentityRepository>();
    detector = new IdentityCreationDetector(repository);
  });

  it('should treat a genesis this node does not hold as a creation', async () => {
    repository.holds.mockResolvedValue(false);

    await expect(
      detector.isCreation(new IdentityCreationDetectorMessage(identity(false))),
    ).resolves.toBe(true);
    expect(repository.holds).toHaveBeenCalledWith(id);
  });

  it('should treat a genesis this node holds as a republish', async () => {
    repository.holds.mockResolvedValue(true);

    await expect(
      detector.isCreation(new IdentityCreationDetectorMessage(identity(false))),
    ).resolves.toBe(false);
  });

  it('should treat a later version of an identity this node does not hold as a creation', async () => {
    repository.holds.mockResolvedValue(false);

    await expect(
      detector.isCreation(new IdentityCreationDetectorMessage(identity(true))),
    ).resolves.toBe(true);
  });

  it('should never treat an update of an identity this node holds as a creation', async () => {
    repository.holds.mockResolvedValue(true);

    await expect(
      detector.isCreation(new IdentityCreationDetectorMessage(identity(true))),
    ).resolves.toBe(false);
  });

  it.each([true, false])(
    'should tell whether this node holds exactly the record (held: %s)',
    async (held) => {
      const publication = identity(true);
      const externalIdentifier = new IdentityExternalIdentifier('bagaaiera');

      repository.calculateExternalIdentifier.mockResolvedValue(
        externalIdentifier,
      );
      repository.hasByExternalIdentifier.mockResolvedValue(held);

      await expect(
        detector.holdsRecord(new IdentityCreationDetectorMessage(publication)),
      ).resolves.toBe(held);
      expect(repository.calculateExternalIdentifier).toHaveBeenCalledWith(
        publication,
      );
      expect(repository.hasByExternalIdentifier).toHaveBeenCalledWith(
        externalIdentifier,
      );
    },
  );
});
