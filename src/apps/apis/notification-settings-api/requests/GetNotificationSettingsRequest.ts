import { NotificationSettingsFindMessage } from '@app/contexts/notification-settings/application/find/messages/NotificationSettingsFindMessage';

export class GetNotificationSettingsRequest {
  constructor(private readonly identityId: string) {}

  public getMessage(): NotificationSettingsFindMessage {
    return new NotificationSettingsFindMessage(this.identityId);
  }
}
