import { InvalidPrivateAuthorizationError } from '@app/contexts/private-authorization/domain/errors/InvalidPrivateAuthorizationError';
import { PrivateAuthorizationRepository } from '@app/contexts/private-authorization/domain/repositories/PrivateAuthorizationRepository';
import PrivateAuthorizationStorageCoordinator from '@app/contexts/private-authorization/infrastructure/PrivateAuthorizationStorageCoordinator';

import { CommunityId } from '../domain/value-objects/CommunityId';

export default class PrivateCommunityPublicStorageGuard {
  public constructor(
    private readonly authorizationRepository: PrivateAuthorizationRepository,
    private readonly storageCoordinator: PrivateAuthorizationStorageCoordinator,
  ) {}

  private async isPublic(communityId: CommunityId): Promise<boolean> {
    return !(await this.authorizationRepository.findScope(
      communityId.valueOf(),
    ));
  }

  private runExclusively<T>(
    communityIds: CommunityId[],
    action: () => Promise<T>,
  ): Promise<T> {
    const ids = [
      ...new Map(
        communityIds.map((communityId) => [communityId.valueOf(), communityId]),
      ).values(),
    ].sort((left, right) => left.valueOf().localeCompare(right.valueOf()));
    const run = (index: number): Promise<T> =>
      index === ids.length
        ? action()
        : this.storageCoordinator.exclusively(ids[index].valueOf(), () =>
            run(index + 1),
          );

    return run(0);
  }

  public async assertPublic(communityId: CommunityId): Promise<void> {
    if (!(await this.isPublic(communityId))) {
      throw new InvalidPrivateAuthorizationError();
    }
  }

  public async filterPublic<T>(
    values: T[],
    communityId: (value: T) => CommunityId,
  ): Promise<T[]> {
    const decisions = await Promise.all(
      values.map((value) => this.isPublic(communityId(value))),
    );

    return values.filter((_value, index) => decisions[index]);
  }

  public runWhilePublic<T>(
    communityId: CommunityId,
    action: () => Promise<T>,
  ): Promise<T> {
    return this.storageCoordinator.exclusively(
      communityId.valueOf(),
      async () => {
        await this.assertPublic(communityId);

        return action();
      },
    );
  }

  public runWhilePublicScopes<T>(
    communityIds: CommunityId[],
    action: () => Promise<T>,
  ): Promise<T> {
    return this.runExclusively(communityIds, async () => {
      await Promise.all(
        communityIds.map((communityId) => this.assertPublic(communityId)),
      );

      return action();
    });
  }

  public runInBackgroundWhilePublic(
    communityId: CommunityId,
    action: () => Promise<void>,
  ): void {
    void this.runWhilePublic(communityId, action).catch((): void => undefined);
  }

  public runInBackgroundWhilePublicScopes(
    communityIds: CommunityId[],
    action: () => Promise<void>,
  ): void {
    void this.runWhilePublicScopes(communityIds, action).catch(
      (): void => undefined,
    );
  }
}
