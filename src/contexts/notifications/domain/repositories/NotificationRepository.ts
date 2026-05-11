import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { Notification } from '../Notification';
import { NotificationId } from '../value-objects/NotificationId';

export interface NotificationRepository {
  findById(notificationId: NotificationId): Promise<Notification | undefined>;
  findByRecipient(
    recipientIdentityId: IdentityId,
    limit: number,
    beforeNotificationId?: NotificationId,
  ): Promise<Notification[]>;
  save(notification: Notification): Promise<void>;
}
