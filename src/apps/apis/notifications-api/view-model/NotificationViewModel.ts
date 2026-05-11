import { Notification } from '@app/contexts/notifications/domain/Notification';

import { NotificationResource } from '../resources/NotificationResource';

export class NotificationViewModel {
  constructor(private readonly notification: Notification) {}

  public toResource(): NotificationResource {
    return this.notification.toPrimitives();
  }
}
