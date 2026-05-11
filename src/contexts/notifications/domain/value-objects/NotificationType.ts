import { Enum } from '@haskou/value-objects';

export type NotificationTypeValue = 'conversation_invitation';
const notificationTypes: Record<string, NotificationTypeValue> = {
  CONVERSATION_INVITATION: 'conversation_invitation',
};

export class NotificationType extends Enum<NotificationTypeValue> {
  public static readonly CONVERSATION_INVITATION = new NotificationType(
    notificationTypes.CONVERSATION_INVITATION,
  );

  public getValues(): NotificationTypeValue[] {
    return Object.values(notificationTypes);
  }
}
