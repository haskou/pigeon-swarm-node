import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { Notification } from '../Notification';
import { NotificationId } from '../value-objects/NotificationId';

export default abstract class NotificationRepository {
  public abstract findById(
    notificationId: NotificationId,
  ): Promise<Notification | undefined>;

  public abstract findByRecipient(
    recipientIdentityId: IdentityId,
    limit: number,
    beforeNotificationId?: NotificationId,
  ): Promise<Notification[]>;

  public abstract save(notification: Notification): Promise<void>;
}
