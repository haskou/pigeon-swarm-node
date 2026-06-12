import { Notification } from '@app/contexts/notifications/domain/Notification';
import NotificationRepository from '@app/contexts/notifications/domain/repositories/NotificationRepository';

import { NotificationsFindMessage } from './messages/NotificationsFindMessage';

export default class NotificationsFinder {
  constructor(private readonly repository: NotificationRepository) {}

  public async find(
    message: NotificationsFindMessage,
  ): Promise<Notification[]> {
    return this.repository.findByRecipient(
      message.recipientIdentityId,
      message.limit,
      message.beforeNotificationId,
    );
  }
}
