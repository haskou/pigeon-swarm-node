import { NotificationScopeSettingsResetMessage } from '@app/contexts/notification-settings/application/reset/messages/NotificationScopeSettingsResetMessage';

import { DeleteNotificationScopeSettingsBody } from '../bodies/DeleteNotificationScopeSettingsBody';

export class DeleteNotificationScopeSettingsRequest {
  constructor(
    private readonly identityId: string,
    private readonly body: DeleteNotificationScopeSettingsBody,
  ) {}

  public getMessage(): NotificationScopeSettingsResetMessage {
    return new NotificationScopeSettingsResetMessage(
      this.identityId,
      this.body.scope,
    );
  }
}
