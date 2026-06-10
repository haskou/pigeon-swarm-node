import { NotificationNotFoundError } from '@app/contexts/notifications/domain/errors/NotificationNotFoundError';
import { NotificationRecipientMismatchError } from '@app/contexts/notifications/domain/errors/NotificationRecipientMismatchError';
import { Notification } from '@app/contexts/notifications/domain/Notification';
import NotificationRepository from '@app/contexts/notifications/domain/repositories/NotificationRepository';
import { NotificationState } from '@app/contexts/notifications/domain/value-objects/NotificationState';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';

import { NotificationUpdateMessage } from './messages/NotificationUpdateMessage';

export default class NotificationUpdater {
  constructor(
    private readonly repository: NotificationRepository,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  private updateState(
    notification: Notification,
    message: NotificationUpdateMessage,
  ): void {
    if (message.state.isEqual(NotificationState.ACCEPTED)) {
      notification.accept();
    }

    if (message.state.isEqual(NotificationState.DECLINED)) {
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

    this.updateState(notification, message);

    await this.repository.save(notification);
    await this.eventPublisher.publish(notification.pullDomainEvents());

    return notification;
  }
}
