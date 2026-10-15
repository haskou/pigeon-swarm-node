import IdentityCreationDetector from '@app/contexts/identities/application/detect-creation/IdentityCreationDetector';
import { IdentityCreationDetectorMessage } from '@app/contexts/identities/application/detect-creation/messages/IdentityCreationDetectorMessage';
import { Identity } from '@app/contexts/identities/domain/Identity';
import IdentityRepository from '@app/contexts/identities/domain/repositories/IdentityRepository';
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

  it('should treat a publication this node does not hold as changing it', async () => {
    repository.holds.mockResolvedValue(false);

    await expect(
      detector.isCreationOrNewerVersion(
        new IdentityCreationDetectorMessage(identity(true)),
      ),
    ).resolves.toBe(true);
    expect(repository.findById).not.toHaveBeenCalled();
  });

  it.each([
    [true, true],
    [false, false],
  ])(
    'should compare a held identity with the stored version (newer: %s)',
    async (newer, expected) => {
      const stored = mock<Identity>();
      const publication = mock<Identity>();

      publication.getId.mockReturnValue(id);

      repository.holds.mockResolvedValue(true);
      repository.findById.mockResolvedValue(stored);
      publication.isNewerThan.mockReturnValue(newer);

      await expect(
        detector.isCreationOrNewerVersion(
          new IdentityCreationDetectorMessage(publication),
        ),
      ).resolves.toBe(expected);
      expect(publication.isNewerThan).toHaveBeenCalledWith(stored);
    },
  );
});
