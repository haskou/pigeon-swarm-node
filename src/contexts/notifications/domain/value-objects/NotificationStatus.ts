import { Enum } from '@haskou/value-objects';

import { notificationStatuses } from './types/NotificationStatuses';
import { NotificationStatusValue } from './types/NotificationStatusValue';

export { NotificationStatusValue } from './types/NotificationStatusValue';

export class NotificationStatus extends Enum<NotificationStatusValue> {
  public static readonly READ = new NotificationStatus(
    notificationStatuses.READ,
  );

  public static readonly UNREAD = new NotificationStatus(
    notificationStatuses.UNREAD,
  );

  public getValues(): NotificationStatusValue[] {
    return Object.values(notificationStatuses);
  }
}
