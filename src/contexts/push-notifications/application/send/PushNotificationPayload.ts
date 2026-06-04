export type PushNotificationPayload = {
  body: string;
  data: Record<string, unknown>;
  tag: string;
  tags?: string[];
  title: string;
  type: 'call' | 'message' | 'notification' | 'notifications_cleared';
};
