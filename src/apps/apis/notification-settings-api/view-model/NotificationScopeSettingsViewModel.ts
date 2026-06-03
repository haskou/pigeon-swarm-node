import { NotificationScopeSettings } from '@app/contexts/notification-settings/domain/NotificationScopeSettings';

import { NotificationScopeSettingsResource } from '../resources/NotificationScopeSettingsResource';

export class NotificationScopeSettingsViewModel {
  constructor(private readonly settings: NotificationScopeSettings) {}

  public toResource(): NotificationScopeSettingsResource {
    const primitives = this.settings.toPrimitives();

    return {
      hideMutedChannels: primitives.hideMutedChannels,
      mobilePushEnabled: primitives.mobilePushEnabled,
      mutedUntil: primitives.mutedUntil,
      notificationLevel: primitives.notificationLevel,
      scope: primitives.scope,
      suppressEveryoneAndHere: primitives.suppressEveryoneAndHere,
      suppressRoleMentions: primitives.suppressRoleMentions,
      updatedAt: primitives.updatedAt,
    };
  }
}
