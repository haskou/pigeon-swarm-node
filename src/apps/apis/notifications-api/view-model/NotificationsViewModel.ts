import { Notification } from '@app/contexts/notifications/domain/Notification';

import { NotificationsResource } from '../resources/NotificationsResource';
import { NotificationViewModel } from './NotificationViewModel';

export class NotificationsViewModel {
  constructor(
    private readonly notifications: Notification[],
    private readonly nextCursor: string | null,
  ) {}

  public toResource(): NotificationsResource {
    return {
      results: this.notifications.map((notification) =>
        new NotificationViewModel(notification).toResource(),
      ),
      nextCursor: this.nextCursor,
    };
  }
}
