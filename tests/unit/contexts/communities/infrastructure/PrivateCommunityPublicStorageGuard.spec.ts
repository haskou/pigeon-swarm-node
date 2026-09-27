import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import PrivateCommunityPublicStorageGuard from '@app/contexts/communities/infrastructure/PrivateCommunityPublicStorageGuard';
import { PrivateAuthorizationRepository } from '@app/contexts/private-authorization/domain/repositories/PrivateAuthorizationRepository';
import PrivateAuthorizationStorageCoordinator from '@app/contexts/private-authorization/infrastructure/PrivateAuthorizationStorageCoordinator';

describe('PrivateCommunityPublicStorageGuard', () => {
  it('serializes public filtering with scope protection', async () => {
    const communityId = new CommunityId('community');
    const authorizationRepository = {
      findScope: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<PrivateAuthorizationRepository>;
    const coordinator = new PrivateAuthorizationStorageCoordinator();
    const guard = new PrivateCommunityPublicStorageGuard(
      authorizationRepository,
      coordinator,
    );
    const protectionStarted = deferred<void>();
    const releaseProtection = deferred<void>();
    const protection = coordinator.exclusively(
      communityId.valueOf(),
      async () => {
        protectionStarted.resolve();
        await releaseProtection.promise;
        authorizationRepository.findScope.mockResolvedValue({} as never);
      },
    );
    await protectionStarted.promise;

    const filtering = guard.filterPublic([communityId], (id) => id);
    await expect(
      Promise.race([
        filtering.then(() => 'completed'),
        new Promise((resolve) => setImmediate(() => resolve('blocked'))),
      ]),
    ).resolves.toBe('blocked');
    releaseProtection.resolve();
    await protection;

    await expect(filtering).resolves.toEqual([]);
  });
});

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
