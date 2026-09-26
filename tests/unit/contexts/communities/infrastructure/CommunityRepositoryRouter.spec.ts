import { Community } from '@app/contexts/communities/domain/Community';
import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import CommunityRepositoryRouter from '@app/contexts/communities/infrastructure/CommunityRepositoryRouter';
import LocalPrivateCommunityRepository from '@app/contexts/communities/infrastructure/local-db/LocalPrivateCommunityRepository';
import OrbitDBCommunityRepository from '@app/contexts/communities/infrastructure/orbitdb/OrbitDBCommunityRepository';
import { PrivateAuthorizationRepository } from '@app/contexts/private-authorization/domain/repositories/PrivateAuthorizationRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { generateKeyPairSync } from 'node:crypto';

describe('CommunityRepositoryRouter', () => {
  const id = new CommunityId('protected');
  let publicRepository: jest.Mocked<OrbitDBCommunityRepository>;
  let privateRepository: jest.Mocked<LocalPrivateCommunityRepository>;
  let authorizationRepository: jest.Mocked<PrivateAuthorizationRepository>;
  let router: CommunityRepositoryRouter;

  beforeEach(() => {
    publicRepository = {
      delete: jest.fn(),
      findById: jest.fn(),
      findByMember: jest.fn().mockResolvedValue([]),
      findDiscoverable: jest.fn().mockResolvedValue([]),
      findSyncable: jest.fn().mockResolvedValue([]),
      save: jest.fn(),
    } as unknown as jest.Mocked<OrbitDBCommunityRepository>;
    privateRepository = {
      findById: jest.fn(),
      findByMember: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<LocalPrivateCommunityRepository>;
    authorizationRepository = {
      findScope: jest.fn().mockResolvedValue({}),
    } as unknown as jest.Mocked<PrivateAuthorizationRepository>;
    router = new CommunityRepositoryRouter(
      publicRepository,
      privateRepository,
      authorizationRepository,
    );
  });

  it('reads a protected identifier only from its local projection', async () => {
    publicRepository.findById.mockResolvedValue({} as Community);

    await router.findById(id);

    expect(privateRepository.findById).toHaveBeenCalledWith(id);
    expect(publicRepository.findById).not.toHaveBeenCalled();
  });

  it('does not fall back to a colliding public document', async () => {
    privateRepository.findById.mockResolvedValue(undefined);
    publicRepository.findById.mockResolvedValue({} as Community);

    await expect(router.findById(id)).resolves.toBeUndefined();
    expect(publicRepository.findById).not.toHaveBeenCalled();
  });

  it('rejects ordinary writes to a protected scope', async () => {
    const protectedCommunity = {
      getId: () => id,
    } as Community;

    await expect(router.save(protectedCommunity)).rejects.toThrow(
      'Invalid private authorization',
    );
    await expect(router.delete(protectedCommunity)).rejects.toThrow(
      'Invalid private authorization',
    );
    expect(publicRepository.save).not.toHaveBeenCalled();
    expect(publicRepository.delete).not.toHaveBeenCalled();
  });

  it('removes protected collisions from public list queries', async () => {
    const protectedCommunity = {
      getId: () => id,
    } as Community;
    const publicCommunity = {
      getId: () => new CommunityId('public'),
    } as Community;
    publicRepository.findDiscoverable.mockResolvedValue([
      protectedCommunity,
      publicCommunity,
    ]);
    authorizationRepository.findScope.mockImplementation(async (scopeId) =>
      scopeId === 'protected' ? ({} as never) : undefined,
    );

    await expect(router.findDiscoverable({})).resolves.toEqual([
      publicCommunity,
    ]);
  });

  it('combines public and private member communities with private precedence', async () => {
    const identityId = validIdentityId();
    const protectedCollision = { getId: () => id } as Community;
    const privateCommunity = { getId: () => id } as Community;
    const publicCommunity = {
      getId: () => new CommunityId('public'),
    } as Community;
    publicRepository.findByMember.mockResolvedValue([
      protectedCollision,
      publicCommunity,
    ]);
    privateRepository.findByMember.mockResolvedValue([privateCommunity]);
    authorizationRepository.findScope.mockImplementation(async (scopeId) =>
      scopeId === id.valueOf() ? ({} as never) : undefined,
    );

    await expect(router.findByMember(identityId)).resolves.toEqual([
      publicCommunity,
      privateCommunity,
    ]);
    expect(privateRepository.findByMember).toHaveBeenCalledWith(identityId);
  });
});

function validIdentityId(): IdentityId {
  return new IdentityId(
    generateKeyPairSync('ed25519')
      .publicKey.export({
        format: 'pem',
        type: 'spki',
      })
      .toString(),
  );
}
