import { Enum } from '@haskou/value-objects';

export type NotificationStateValue = 'accepted' | 'declined' | 'pending';
const notificationStates: Record<string, NotificationStateValue> = {
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
  PENDING: 'pending',
};

export class NotificationState extends Enum<NotificationStateValue> {
  public static readonly ACCEPTED = new NotificationState(
    notificationStates.ACCEPTED,
  );

  public static readonly DECLINED = new NotificationState(
    notificationStates.DECLINED,
  );

  public static readonly PENDING = new NotificationState(
    notificationStates.PENDING,
  );

  public getValues(): NotificationStateValue[] {
    return Object.values(notificationStates);
  }
}
