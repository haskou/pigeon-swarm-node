import { Notification } from '@app/contexts/notifications/domain/Notification';
import NotificationRepository from '@app/contexts/notifications/domain/repositories/NotificationRepository';
import PendingGroupInvitationCaps from '@app/contexts/notifications/domain/services/PendingGroupInvitationCaps';

import { NotificationsFindMessage } from './messages/NotificationsFindMessage';

/**
 * Lists a recipient's notifications, newest record id first. The pending group
 * invitation caps apply to the complete set before pagination, so pages and
 * cursors only ever see listed letters; a held-back letter used as a cursor is
 * an unknown cursor and the listing starts over.
 */
export default class NotificationsFinder {
  constructor(
    private readonly repository: NotificationRepository,
    private readonly caps: PendingGroupInvitationCaps,
  ) {}

  public async find(
    message: NotificationsFindMessage,
  ): Promise<Notification[]> {
    const listed = this.caps
      .listed(
        await this.repository.findByRecipient(message.recipientIdentityId),
      )
      .sort((left, right) => {
        const leftId = left.getId().valueOf();
        const rightId = right.getId().valueOf();

        return leftId < rightId ? 1 : leftId > rightId ? -1 : 0;
      });
    const before = message.beforeNotificationId;
    const start = before
      ? listed.findIndex((notification) =>
          notification.getId().isEqual(before),
        ) + 1
      : 0;

    return listed.slice(start, start + message.limit);
  }
}
