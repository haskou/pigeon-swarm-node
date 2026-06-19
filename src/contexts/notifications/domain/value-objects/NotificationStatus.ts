import { Enum } from '@haskou/value-objects';

const notificationStatuses = {
  READ: 'read',
  UNREAD: 'unread',
} as const;

export class NotificationStatus extends Enum<string> {
  public static readonly READ = new NotificationStatus(
    notificationStatuses.READ,
  );

  public static readonly UNREAD = new NotificationStatus(
    notificationStatuses.UNREAD,
  );

  public getValues(): string[] {
    return Object.values(notificationStatuses);
  }
}
