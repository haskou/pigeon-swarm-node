import { NotificationTypeValue } from './NotificationTypeValue';

export const notificationTypes: Record<string, NotificationTypeValue> = {
  COMMUNITY_INVITATION: 'community_invitation',
  CONVERSATION_INVITATION: 'conversation_invitation',
  GROUP_CONVERSATION_INVITATION: 'group_conversation_invitation',
  MISSED_CALL: 'missed_call',
};
