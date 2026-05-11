import { Enum } from '@haskou/value-objects';

export type NotificationStatusValue = 'read' | 'unread';
const notificationStatuses: Record<string, NotificationStatusValue> = {
  READ: 'read',
  UNREAD: 'unread',
};

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
