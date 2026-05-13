import { Enum } from '@haskou/value-objects';

export type NotificationTypeValue =
  | 'community_invitation'
  | 'conversation_invitation';
const notificationTypes: Record<string, NotificationTypeValue> = {
  COMMUNITY_INVITATION: 'community_invitation',
  CONVERSATION_INVITATION: 'conversation_invitation',
};

export class NotificationType extends Enum<NotificationTypeValue> {
  public static readonly COMMUNITY_INVITATION = new NotificationType(
    notificationTypes.COMMUNITY_INVITATION,
  );

  public static readonly CONVERSATION_INVITATION = new NotificationType(
    notificationTypes.CONVERSATION_INVITATION,
  );

  public getValues(): NotificationTypeValue[] {
    return Object.values(notificationTypes);
  }
}
