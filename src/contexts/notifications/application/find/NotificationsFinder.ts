import { Notification } from '@app/contexts/notifications/domain/Notification';
import NotificationRepository from '@app/contexts/notifications/domain/repositories/NotificationRepository';
import PendingGroupInvitationCaps from '@app/contexts/notifications/domain/services/PendingGroupInvitationCaps';
import { PageSlice } from '@app/contexts/shared/application/pagination/PageSlice';

import { NotificationsFindMessage } from './messages/NotificationsFindMessage';

/**
 * Lists a recipient's notifications, newest record id first. The pending group
 * invitation caps apply to the complete set before pagination, so pages and
 * cursors only ever see listed letters. A cursor is a record id position, so a
 * listing resumes after it even when its letter is no longer listed.
 */
export default class NotificationsFinder {
  constructor(
    private readonly repository: NotificationRepository,
    private readonly caps: PendingGroupInvitationCaps,
  ) {}

  public async find(
    message: NotificationsFindMessage,
  ): Promise<PageSlice<Notification>> {
    const listed = this.caps.listed(
      await this.repository.findByRecipient(message.recipientIdentityId),
    );

    return PageSlice.of({
      after: message.after,
      items: listed,
      limit: message.limit,
      order: 'desc',
      position: (notification) => notification.getId().valueOf(),
    });
  }
}
