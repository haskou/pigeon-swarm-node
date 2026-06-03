import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { NotificationScopeSettings } from '@app/contexts/notification-settings/domain/NotificationScopeSettings';
import { NotificationScopeSettingsPreferences } from '@app/contexts/notification-settings/domain/NotificationScopeSettingsPreferences';
import { NotificationSettingsWereUpdatedEvent } from '@app/contexts/notification-settings/domain/events/NotificationSettingsWereUpdatedEvent';
import { NotificationLevel } from '@app/contexts/notification-settings/domain/value-objects/NotificationLevel';
import { NotificationMuteUntil } from '@app/contexts/notification-settings/domain/value-objects/NotificationMuteUntil';
import { NotificationSettingScope } from '@app/contexts/notification-settings/domain/value-objects/NotificationSettingScope';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

describe('NotificationScopeSettings', () => {
  const identityId = new IdentityId(
    'MCowBQYDK2VwAyEAIZERRRhGaokvb3xQqMGr9Y2ble6jUd51OuZRsvW52Q4=',
  );
  const communityId = new CommunityId('6a072ee87e00690039d0ad27');
  const channelId = new CommunityChannelId('6a073dc64d72b40039b156f8');
  const scope = NotificationSettingScope.communityChannel(
    communityId,
    channelId,
  );

  it('records an update event when created', () => {
    const settings = NotificationScopeSettings.create(
      identityId,
      scope,
      NotificationScopeSettingsPreferences.defaults(),
    );

    expect(settings.pullDomainEvents()).toEqual([
      expect.any(NotificationSettingsWereUpdatedEvent),
    ]);
  });

  it('suppresses push when muted forever', () => {
    const settings = NotificationScopeSettings.create(
      identityId,
      scope,
      new NotificationScopeSettingsPreferences(
        new NotificationLevel(NotificationLevel.ALL),
        NotificationMuteUntil.forever(),
        false,
        false,
        true,
        false,
      ),
    );

    expect(settings.shouldSuppressPush(false, false, false)).toBe(true);
  });

  it('allows mentioned pushes when level is mentions', () => {
    const settings = NotificationScopeSettings.create(
      identityId,
      scope,
      new NotificationScopeSettingsPreferences(
        new NotificationLevel(NotificationLevel.MENTIONS),
        undefined,
        false,
        false,
        true,
        false,
      ),
    );

    expect(settings.shouldSuppressPush(false, false, false)).toBe(true);
    expect(settings.shouldSuppressPush(true, false, false)).toBe(false);
  });

  it('stops suppressing after a temporary mute expires', () => {
    const settings = NotificationScopeSettings.create(
      identityId,
      scope,
      new NotificationScopeSettingsPreferences(
        new NotificationLevel(NotificationLevel.ALL),
        NotificationMuteUntil.fromTimestamp(new Timestamp(1000)),
        false,
        false,
        true,
        false,
      ),
    );

    expect(
      settings.shouldSuppressPush(false, false, false, new Timestamp(1001)),
    ).toBe(false);
  });
});
