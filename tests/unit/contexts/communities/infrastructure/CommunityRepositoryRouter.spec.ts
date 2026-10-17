import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityInvitations } from '@app/contexts/communities/domain/entities/invitations/CommunityInvitations';
import { CommunityNotFoundError } from '@app/contexts/communities/domain/errors/CommunityNotFoundError';
import { CommunityOperation } from '@app/contexts/communities/domain/operations/CommunityOperation';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import CommunityRepositoryRouter from '@app/contexts/communities/infrastructure/CommunityRepositoryRouter';
import LocalPrivateCommunityRepository from '@app/contexts/communities/infrastructure/local-db/LocalPrivateCommunityRepository';
import OrbitDBCommunityRepository from '@app/contexts/communities/infrastructure/orbitdb/OrbitDBCommunityRepository';
import { PrivateAuthorizationRepository } from '@app/contexts/private-authorization/domain/repositories/PrivateAuthorizationRepository';
import PrivateAuthorizationStorageCoordinator from '@app/contexts/private-authorization/infrastructure/PrivateAuthorizationStorageCoordinator';
import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { generateKeyPairSync } from 'node:crypto';

describe('CommunityRepositoryRouter', () => {
  const id = new CommunityId('protected');
  let publicRepository: jest.Mocked<OrbitDBCommunityRepository>;
  let privateRepository: jest.Mocked<LocalPrivateCommunityRepository>;
  let authorizationRepository: jest.Mocked<PrivateAuthorizationRepository>;
  let storageCoordinator: PrivateAuthorizationStorageCoordinator;
  let router: CommunityRepositoryRouter;

  beforeEach(() => {
    publicRepository = {
      requireById: jest.fn(),
      findByMember: jest.fn().mockResolvedValue([]),
      findDiscoverable: jest.fn().mockResolvedValue([]),
      findFrontier: jest.fn().mockResolvedValue(['head']),
      findInvitations: jest.fn(),
      findOperations: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<OrbitDBCommunityRepository>;
    privateRepository = {
      requireById: jest.fn(),
      findByMember: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<LocalPrivateCommunityRepository>;
    authorizationRepository = {
      hasScope: jest.fn().mockResolvedValue(true),
      findScopeIds: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<PrivateAuthorizationRepository>;
    storageCoordinator = new PrivateAuthorizationStorageCoordinator();
    router = new CommunityRepositoryRouter(
      publicRepository,
      privateRepository,
      authorizationRepository,
      storageCoordinator,
    );
  });

  it('reads a protected identifier only from its local projection', async () => {
    privateRepository.requireById.mockResolvedValue({} as Community);
    publicRepository.requireById.mockResolvedValue({} as Community);

    await router.requireById(id);

    expect(privateRepository.requireById).toHaveBeenCalledWith(id);
    expect(publicRepository.requireById).not.toHaveBeenCalled();
  });

  it('does not fall back to a colliding public document', async () => {
    privateRepository.requireById.mockRejectedValue(
      new CommunityNotFoundError(),
    );
    publicRepository.requireById.mockResolvedValue({} as Community);

    await expect(router.requireById(id)).rejects.toBeInstanceOf(
      CommunityNotFoundError,
    );
    expect(publicRepository.requireById).not.toHaveBeenCalled();
  });

  it('serializes lookup with scope protection', async () => {
    const provisioningStarted = deferred<void>();
    const releaseProvisioning = deferred<void>();
    const privateCommunity = {} as Community;
    authorizationRepository.hasScope.mockResolvedValue(false);
    privateRepository.requireById.mockResolvedValue(privateCommunity);
    publicRepository.requireById.mockResolvedValue({} as Community);
    const provisioning = storageCoordinator.exclusively(
      id.valueOf(),
      async () => {
        authorizationRepository.hasScope.mockResolvedValue(true);
        provisioningStarted.resolve();
        await releaseProvisioning.promise;
      },
    );
    await provisioningStarted.promise;

    const lookup = router.requireById(id);
    releaseProvisioning.resolve();
    await provisioning;

    await expect(lookup).resolves.toBe(privateCommunity);
    expect(publicRepository.requireById).not.toHaveBeenCalled();
  });

  it('rejects ordinary writes to a protected scope', async () => {
    const operation = {
      getCommunityId: () => id,
    } as CommunityOperation;

    await expect(
      router.save(operation, {} as PublicMutationProof),
    ).rejects.toThrow('Invalid private authorization');
    expect(publicRepository.save).not.toHaveBeenCalled();
  });

  it('saves operations of a public community through the public repository', async () => {
    const operation = {
      getCommunityId: () => id,
    } as CommunityOperation;
    const proof = {} as PublicMutationProof;
    authorizationRepository.hasScope.mockResolvedValue(false);

    await router.save(operation, proof);

    expect(publicRepository.save).toHaveBeenCalledWith(operation, proof);
  });

  it('reports no frontier for a protected scope and the public one otherwise', async () => {
    await expect(router.findFrontier(id)).resolves.toEqual([]);
    expect(publicRepository.findFrontier).not.toHaveBeenCalled();

    authorizationRepository.hasScope.mockResolvedValue(false);

    await expect(router.findFrontier(id)).resolves.toEqual(['head']);
  });

  it('serves no operations for a protected scope and the public ones otherwise', async () => {
    const operations = [{} as CommunityOperation];
    publicRepository.findOperations.mockResolvedValue(operations);

    await expect(router.findOperations(id, undefined, 500)).resolves.toEqual(
      [],
    );
    expect(publicRepository.findOperations).not.toHaveBeenCalled();

    authorizationRepository.hasScope.mockResolvedValue(false);

    await expect(router.findOperations(id, 'after', 2)).resolves.toBe(
      operations,
    );
    expect(publicRepository.findOperations).toHaveBeenCalledWith(
      id,
      'after',
      2,
    );
  });

  it('knows no invitation of a protected scope and the public ones otherwise', async () => {
    const invitations = {} as CommunityInvitations;
    publicRepository.findInvitations.mockResolvedValue(invitations);

    await expect(router.findInvitations(id)).resolves.toBe(
      CommunityInvitations.EMPTY,
    );
    expect(publicRepository.findInvitations).not.toHaveBeenCalled();

    authorizationRepository.hasScope.mockResolvedValue(false);

    await expect(router.findInvitations(id)).resolves.toBe(invitations);
  });

  it('reports the replicated frontiers of a network from the public store', async () => {
    const frontiers = [{ communityId: id, frontier: ['head'] }];

    publicRepository.findFrontiersByNetwork = jest
      .fn()
      .mockResolvedValue(frontiers);

    await expect(router.findFrontiersByNetwork('network-1')).resolves.toBe(
      frontiers,
    );
    expect(publicRepository.findFrontiersByNetwork).toHaveBeenCalledWith(
      'network-1',
    );
    expect(authorizationRepository.hasScope).not.toHaveBeenCalled();
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
    authorizationRepository.hasScope.mockImplementation(
      async (scopeId) => scopeId === 'protected',
    );

    await expect(router.findDiscoverable({})).resolves.toEqual([
      publicCommunity,
    ]);
  });

  it('excludes protected identifiers before public discovery pagination', async () => {
    authorizationRepository.findScopeIds.mockResolvedValue(['protected']);

    await router.findDiscoverable({ networkId: 'network' });

    expect(publicRepository.findDiscoverable).toHaveBeenCalledWith(
      { networkId: 'network' },
      [id],
    );
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
    authorizationRepository.hasScope.mockImplementation(
      async (scopeId) => scopeId === id.valueOf(),
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

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value?: T): void;
} {
  let resolve: (value?: T) => void = () => undefined;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });

  return { promise, resolve };
}
