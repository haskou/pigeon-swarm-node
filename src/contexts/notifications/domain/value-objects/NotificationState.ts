import { Enum } from '@haskou/value-objects';

const notificationStates = {
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
  PENDING: 'pending',
} as const;

export class NotificationState extends Enum<string> {
  public static readonly ACCEPTED = new NotificationState(
    notificationStates.ACCEPTED,
  );

  public static readonly DECLINED = new NotificationState(
    notificationStates.DECLINED,
  );

  public static readonly PENDING = new NotificationState(
    notificationStates.PENDING,
  );

  public getValues(): string[] {
    return Object.values(notificationStates);
  }
}
