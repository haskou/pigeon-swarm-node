import { Notification } from '@app/contexts/notifications/domain/Notification';
import NotificationRepository from '@app/contexts/notifications/domain/repositories/NotificationRepository';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';

import { NotificationCreateMessage } from './messages/NotificationCreateMessage';

export default class NotificationCreator {
  constructor(
    private readonly repository: NotificationRepository,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  public async create(
    message: NotificationCreateMessage,
  ): Promise<Notification> {
    let notification: Notification;

    if (message.isCommunityInvitation() && message.communityPayload) {
      notification = Notification.communityInvitation(message.communityPayload);
    } else if (
      message.isGroupConversationInvitation() &&
      message.conversationPayload
    ) {
      notification = Notification.groupConversationInvitation(
        message.conversationPayload,
      );
    } else if (message.conversationPayload) {
      notification = Notification.conversationInvitation(
        message.conversationPayload,
      );
    } else {
      throw new Error('Invalid notification creation message.');
    }

    await this.repository.save(notification);
    await this.eventPublisher.publish(notification.pullDomainEvents());

    return notification;
  }
}
