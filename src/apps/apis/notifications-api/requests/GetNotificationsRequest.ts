import { NotificationsFindMessage } from '@app/contexts/notifications/application/find/messages/NotificationsFindMessage';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export class GetNotificationsRequest {
  constructor(
    private readonly recipientIdentityId: IdentityId,
    private readonly limit?: string,
    private readonly beforeNotificationId?: string,
  ) {}

  public getMessage(): NotificationsFindMessage {
    return new NotificationsFindMessage(
      this.recipientIdentityId.valueOf(),
      this.limit ? Number(this.limit) : undefined,
      this.beforeNotificationId,
    );
  }
}
