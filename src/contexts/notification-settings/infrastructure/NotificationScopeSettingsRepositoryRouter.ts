import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import PrivateCommunityPublicStorageGuard from '@app/contexts/communities/infrastructure/PrivateCommunityPublicStorageGuard';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { NotificationScopeSettings } from '../domain/NotificationScopeSettings';
import NotificationScopeSettingsRepository from '../domain/repositories/NotificationScopeSettingsRepository';
import { NotificationSettingScope } from '../domain/value-objects/NotificationSettingScope';
import LocalNotificationScopeSettingsRepository from './local-db/LocalNotificationScopeSettingsRepository';
import OrbitDBNotificationScopeSettingsRepository from './orbitdb/OrbitDBNotificationScopeSettingsRepository';

export default class NotificationScopeSettingsRepositoryRouter extends NotificationScopeSettingsRepository {
  public constructor(
    private readonly publicRepository: OrbitDBNotificationScopeSettingsRepository,
    private readonly privateRepository: LocalNotificationScopeSettingsRepository,
    private readonly publicStorageGuard: PrivateCommunityPublicStorageGuard,
  ) {
    super();
  }

  private communityId(
    scope: NotificationSettingScope,
  ): CommunityId | undefined {
    const communityId = scope.toPrimitives().communityId;

    return communityId ? new CommunityId(communityId) : undefined;
  }

  private async publicSettings(
    settings: NotificationScopeSettings[],
  ): Promise<NotificationScopeSettings[]> {
    const decisions = await Promise.all(
      settings.map((value) => this.isPrivateScope(value.getScope())),
    );

    return settings.filter((_value, index) => !decisions[index]);
  }

  private async privateSettings(
    settings: NotificationScopeSettings[],
  ): Promise<NotificationScopeSettings[]> {
    const decisions = await Promise.all(
      settings.map((value) => this.isPrivateScope(value.getScope())),
    );

    return settings.filter((_value, index) => decisions[index]);
  }

  private runWhilePublic<T>(
    scope: NotificationSettingScope,
    action: () => Promise<T>,
  ): Promise<T> {
    const communityId = this.communityId(scope);

    return communityId
      ? this.publicStorageGuard.runWhilePublic(communityId, action)
      : action();
  }

  public async delete(
    identityId: IdentityId,
    scope: NotificationSettingScope,
  ): Promise<void> {
    if (await this.isPrivateScope(scope)) {
      await this.privateRepository.delete(identityId, scope);

      return;
    }

    await this.runWhilePublic(scope, () =>
      this.publicRepository.delete(identityId, scope),
    );
  }

  public async findByIdentityId(
    identityId: IdentityId,
  ): Promise<NotificationScopeSettings[]> {
    const [publicValues, privateValues] = await Promise.all([
      this.publicRepository.findByIdentityId(identityId),
      this.privateRepository.findByIdentityId(identityId),
    ]);
    const [publicSettings, privateSettings] = await Promise.all([
      this.publicSettings(publicValues),
      this.privateSettings(privateValues),
    ]);
    const settings = new Map(
      publicSettings.map((value) => [value.getScope().key(), value]),
    );

    for (const value of privateSettings) {
      settings.set(value.getScope().key(), value);
    }

    return [...settings.values()];
  }

  public async findByScope(
    identityId: IdentityId,
    scope: NotificationSettingScope,
  ): Promise<NotificationScopeSettings | undefined> {
    if (await this.isPrivateScope(scope)) {
      return this.privateRepository.findByScope(identityId, scope);
    }

    return this.runWhilePublic(scope, () =>
      this.publicRepository.findByScope(identityId, scope),
    );
  }

  public async isPrivateScope(
    scope: NotificationSettingScope,
  ): Promise<boolean> {
    const communityId = this.communityId(scope);

    return communityId
      ? this.publicStorageGuard.isProtected(communityId)
      : false;
  }

  public async save(settings: NotificationScopeSettings): Promise<void> {
    const scope = settings.getScope();

    if (await this.isPrivateScope(scope)) {
      await this.privateRepository.save(settings);

      return;
    }

    await this.runWhilePublic(scope, () =>
      this.publicRepository.save(settings),
    );
  }
}
