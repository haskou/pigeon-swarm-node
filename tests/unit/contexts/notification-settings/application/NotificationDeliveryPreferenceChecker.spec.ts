import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import NotificationDeliveryPreferenceChecker from '@app/contexts/notification-settings/application/should-deliver/NotificationDeliveryPreferenceChecker';
import { NotificationDeliveryShouldSendPushMessage } from '@app/contexts/notification-settings/application/should-deliver/messages/NotificationDeliveryShouldSendPushMessage';
import { NotificationScopeSettings } from '@app/contexts/notification-settings/domain/NotificationScopeSettings';
import { NotificationScopeSettingsPreferences } from '@app/contexts/notification-settings/domain/NotificationScopeSettingsPreferences';
import NotificationScopeSettingsRepository from '@app/contexts/notification-settings/domain/repositories/NotificationScopeSettingsRepository';
import { NotificationLevel } from '@app/contexts/notification-settings/domain/value-objects/NotificationLevel';
import { NotificationSettingScope } from '@app/contexts/notification-settings/domain/value-objects/NotificationSettingScope';
import { NotificationSettingScopeType } from '@app/contexts/notification-settings/domain/value-objects/NotificationSettingScopeType';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

class InMemoryNotificationScopeSettingsRepository
  implements NotificationScopeSettingsRepository
{
  private readonly settings = new Map<string, NotificationScopeSettings>();

  private key(identityId: IdentityId, scope: NotificationSettingScope): string {
    return `${identityId.valueOf()}:${scope.key()}`;
  }

  public async delete(
    identityId: IdentityId,
    scope: NotificationSettingScope,
  ): Promise<void> {
    this.settings.delete(this.key(identityId, scope));
  }

  public async findByIdentityId(): Promise<NotificationScopeSettings[]> {
    return Array.from(this.settings.values());
  }

  public async findByScope(
    identityId: IdentityId,
    scope: NotificationSettingScope,
  ): Promise<NotificationScopeSettings | undefined> {
    return this.settings.get(this.key(identityId, scope));
  }

  public async save(settings: NotificationScopeSettings): Promise<void> {
    this.settings.set(
      this.key(settings.getIdentityId(), settings.getScope()),
      settings,
    );
  }
}

describe('NotificationDeliveryPreferenceChecker', () => {
  const identityId = new IdentityId(
    'MCowBQYDK2VwAyEAIZERRRhGaokvb3xQqMGr9Y2ble6jUd51OuZRsvW52Q4=',
  );
  const communityId = new CommunityId('6a072ee87e00690039d0ad27');
  const channelId = new CommunityChannelId('6a073dc64d72b40039b156f8');

  it('inherits community settings for community channel pushes', async () => {
    const repository = new InMemoryNotificationScopeSettingsRepository();
    const checker = new NotificationDeliveryPreferenceChecker(repository);

    await repository.save(
      NotificationScopeSettings.create(
        identityId,
        NotificationSettingScope.community(communityId),
        new NotificationScopeSettingsPreferences(
          new NotificationLevel(NotificationLevel.NONE),
          undefined,
          false,
          false,
          true,
          false,
        ),
      ),
    );

    await expect(
      checker.shouldSendPush(
        new NotificationDeliveryShouldSendPushMessage(
          identityId.valueOf(),
          {
            channelId: channelId.valueOf(),
            communityId: communityId.valueOf(),
            type: NotificationSettingScopeType.COMMUNITY_CHANNEL,
          },
          false,
          false,
          false,
        ),
      ),
    ).resolves.toBe(false);
  });

  it('lets a channel override parent community settings', async () => {
    const repository = new InMemoryNotificationScopeSettingsRepository();
    const checker = new NotificationDeliveryPreferenceChecker(repository);

    await repository.save(
      NotificationScopeSettings.create(
        identityId,
        NotificationSettingScope.community(communityId),
        new NotificationScopeSettingsPreferences(
          new NotificationLevel(NotificationLevel.NONE),
          undefined,
          false,
          false,
          true,
          false,
        ),
      ),
    );
    await repository.save(
      NotificationScopeSettings.create(
        identityId,
        NotificationSettingScope.communityChannel(communityId, channelId),
        NotificationScopeSettingsPreferences.defaults(),
      ),
    );

    await expect(
      checker.shouldSendPush(
        new NotificationDeliveryShouldSendPushMessage(
          identityId.valueOf(),
          {
            channelId: channelId.valueOf(),
            communityId: communityId.valueOf(),
            type: NotificationSettingScopeType.COMMUNITY_CHANNEL,
          },
          false,
          false,
          false,
        ),
      ),
    ).resolves.toBe(true);
  });
});
