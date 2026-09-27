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
    return !(await this.isProtected(communityId));
  }

  public async isProtected(communityId: CommunityId): Promise<boolean> {
    return Boolean(
      await this.authorizationRepository.findScope(communityId.valueOf()),
    );
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
    const communityIds = values.map(communityId);

    return this.storageCoordinator.exclusivelyAll(
      communityIds.map((id) => id.valueOf()),
      async () => {
        const decisions = await Promise.all(
          communityIds.map((id) => this.isPublic(id)),
        );

        return values.filter((_value, index) => decisions[index]);
      },
    );
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
    return this.storageCoordinator.exclusivelyAll(
      communityIds.map((id) => id.valueOf()),
      async () => {
        await Promise.all(
          communityIds.map((communityId) => this.assertPublic(communityId)),
        );

        return action();
      },
    );
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
