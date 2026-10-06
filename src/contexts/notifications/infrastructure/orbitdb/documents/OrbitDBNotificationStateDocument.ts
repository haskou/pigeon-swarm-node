export type OrbitDBNotificationStateDocument = {
  id: string;
  notificationId: string;
  read: boolean;
  recipientIdentityId: string;
  scopeType: 'notification_state';
  state: string;
};
