import { Enum } from '@haskou/value-objects';

export type NotificationTypeValue =
  | 'community_invitation'
  | 'conversation_invitation'
  | 'group_conversation_invitation'
  | 'missed_call';
const notificationTypes: Record<string, NotificationTypeValue> = {
  COMMUNITY_INVITATION: 'community_invitation',
  CONVERSATION_INVITATION: 'conversation_invitation',
  GROUP_CONVERSATION_INVITATION: 'group_conversation_invitation',
  MISSED_CALL: 'missed_call',
};

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
