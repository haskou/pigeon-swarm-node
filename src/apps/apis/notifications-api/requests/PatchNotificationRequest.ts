import { NotificationUpdateMessage } from '@app/contexts/notifications/application/update/messages/NotificationUpdateMessage';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { PatchNotificationBody } from '../bodies/PatchNotificationBody';

export class PatchNotificationRequest {
  constructor(
    private readonly notificationId: string,
    private readonly recipientIdentityId: IdentityId,
    private readonly body: PatchNotificationBody,
  ) {}

  public getMessage(): NotificationUpdateMessage {
    return new NotificationUpdateMessage(
      this.notificationId,
      this.recipientIdentityId.valueOf(),
      this.body.state,
    );
  }
}
