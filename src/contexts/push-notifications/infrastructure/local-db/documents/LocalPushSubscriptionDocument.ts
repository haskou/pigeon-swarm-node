export interface LocalPushSubscriptionDocument extends Record<string, unknown> {
  _id: string;
  auth: string;
  createdAt: number;
  endpoint: string;
  expirationTime?: number;
  identityId: string;
  p256dh: string;
}
