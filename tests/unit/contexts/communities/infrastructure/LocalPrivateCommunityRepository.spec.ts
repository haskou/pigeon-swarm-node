import LocalPrivateCommunityRepository from '@app/contexts/communities/infrastructure/local-db/LocalPrivateCommunityRepository';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { InvalidPrivateAuthorizationError } from '@app/contexts/private-authorization/domain/errors/InvalidPrivateAuthorizationError';
import { PrivateAuthorizationRepository } from '@app/contexts/private-authorization/domain/repositories/PrivateAuthorizationRepository';

describe('LocalPrivateCommunityRepository', () => {
  const authorization = {
    findProjection: jest.fn(),
  } as unknown as jest.Mocked<PrivateAuthorizationRepository>;
  const repository = new LocalPrivateCommunityRepository(authorization);

  beforeEach(() => jest.clearAllMocks());

  it('returns no community when the local private projection is absent', async () => {
    authorization.findProjection.mockResolvedValue(undefined);

    await expect(
      repository.findById(new CommunityId('protected')),
    ).resolves.toBeUndefined();
  });

  it('fails closed when the private projection is malformed', async () => {
    authorization.findProjection.mockResolvedValue({ id: 'protected' });

    await expect(
      repository.findById(new CommunityId('protected')),
    ).rejects.toBeInstanceOf(InvalidPrivateAuthorizationError);
  });
});
