import { Enum } from '@haskou/value-objects';

import { notificationStates } from './types/NotificationStates';
import { NotificationStateValue } from './types/NotificationStateValue';

export { NotificationStateValue } from './types/NotificationStateValue';

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
