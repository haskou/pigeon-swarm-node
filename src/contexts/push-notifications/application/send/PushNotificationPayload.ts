export type PushNotificationPayload = {
  body: string;
  data: Record<string, unknown>;
  tag: string;
  title: string;
  type: 'call' | 'message' | 'notification';
};
