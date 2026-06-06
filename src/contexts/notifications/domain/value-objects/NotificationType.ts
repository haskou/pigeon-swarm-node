import { Enum } from '@haskou/value-objects';

import { notificationTypes } from './types/NotificationTypes';
import { NotificationTypeValue } from './types/NotificationTypeValue';

export { NotificationTypeValue } from './types/NotificationTypeValue';

export class NotificationType extends Enum<NotificationTypeValue> {
  public static readonly COMMUNITY_INVITATION = new NotificationType(
    notificationTypes.COMMUNITY_INVITATION,
  );

  public static readonly CONVERSATION_INVITATION = new NotificationType(
    notificationTypes.CONVERSATION_INVITATION,
  );

  public static readonly GROUP_CONVERSATION_INVITATION = new NotificationType(
    notificationTypes.GROUP_CONVERSATION_INVITATION,
  );

  public static readonly MISSED_CALL = new NotificationType(
    notificationTypes.MISSED_CALL,
  );

  public getValues(): NotificationTypeValue[] {
    return Object.values(notificationTypes);
  }
}
