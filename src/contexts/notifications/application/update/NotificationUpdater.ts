import { NotificationNotFoundError } from '@app/contexts/notifications/domain/errors/NotificationNotFoundError';
import { NotificationRecipientMismatchError } from '@app/contexts/notifications/domain/errors/NotificationRecipientMismatchError';
import { Notification } from '@app/contexts/notifications/domain/Notification';
import { NotificationRepository } from '@app/contexts/notifications/domain/repositories/NotificationRepository';
import { NotificationState } from '@app/contexts/notifications/domain/value-objects/NotificationState';
import { NotificationStatus } from '@app/contexts/notifications/domain/value-objects/NotificationStatus';

import { NotificationUpdateMessage } from './messages/NotificationUpdateMessage';

export default class NotificationUpdater {
  constructor(private readonly repository: NotificationRepository) {}

  private applyStatus(
    notification: Notification,
    message: NotificationUpdateMessage,
  ): void {
    if (message.status?.isEqual(NotificationStatus.READ)) {
      notification.markAsRead();
    }

    if (message.status?.isEqual(NotificationStatus.UNREAD)) {
      notification.markAsUnread();
    }
  }

  private applyState(
    notification: Notification,
    message: NotificationUpdateMessage,
  ): void {
    if (message.state?.isEqual(NotificationState.ACCEPTED)) {
      notification.accept(message.keychainExternalIdentifier || '');
    }

    if (message.state?.isEqual(NotificationState.DECLINED)) {
      notification.decline();
    }
  }

  public async update(
    message: NotificationUpdateMessage,
  ): Promise<Notification> {
    const notification = await this.repository.findById(message.notificationId);

    if (!notification) {
      throw new NotificationNotFoundError();
    }

    if (!notification.isRecipient(message.recipientIdentityId)) {
      throw new NotificationRecipientMismatchError();
    }

    this.applyStatus(notification, message);
    this.applyState(notification, message);

    if (message.archive) {
      notification.archive();
    }

    await this.repository.save(notification);

    return notification;
  }
}
