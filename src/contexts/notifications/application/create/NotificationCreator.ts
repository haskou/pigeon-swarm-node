import { Notification } from '@app/contexts/notifications/domain/Notification';
import NotificationRepository from '@app/contexts/notifications/domain/repositories/NotificationRepository';
import { DomainEventPublisher } from '@haskou/ddd-kernel/domain';

import { NotificationCreateMessage } from './messages/NotificationCreateMessage';

export default class NotificationCreator {
  constructor(
    private readonly repository: NotificationRepository,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  public async create(
    message: NotificationCreateMessage,
  ): Promise<Notification> {
    const notification = message.match({
      communityInvitation: (payload) =>
        Notification.communityInvitation(payload),
      conversationInvitation: (payload) =>
        Notification.conversationInvitation(payload),
      groupConversationInvitation: (payload) =>
        Notification.groupConversationInvitation(payload),
    });

    await this.repository.save(notification);
    await this.eventPublisher.publish(notification.pullDomainEvents());

    return notification;
  }
}
