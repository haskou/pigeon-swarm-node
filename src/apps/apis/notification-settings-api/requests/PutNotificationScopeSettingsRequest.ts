import { NotificationScopeSettingsUpdateMessage } from '@app/contexts/notification-settings/application/update/messages/NotificationScopeSettingsUpdateMessage';

import { PutNotificationScopeSettingsBody } from '../bodies/PutNotificationScopeSettingsBody';

export class PutNotificationScopeSettingsRequest {
  constructor(
    private readonly identityId: string,
    private readonly body: PutNotificationScopeSettingsBody,
  ) {}

  public getMessage(): NotificationScopeSettingsUpdateMessage {
    return new NotificationScopeSettingsUpdateMessage(
      this.identityId,
      this.body.scope,
      {
        hideMutedChannels: this.body.hideMutedChannels,
        mobilePushEnabled: this.body.mobilePushEnabled,
        mutedUntil: this.body.mutedUntil,
        notificationLevel: this.body.notificationLevel,
        suppressEveryoneAndHere: this.body.suppressEveryoneAndHere,
        suppressRoleMentions: this.body.suppressRoleMentions,
      },
    );
  }
}
