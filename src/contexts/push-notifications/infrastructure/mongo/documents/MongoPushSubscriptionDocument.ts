export type MongoPushSubscriptionDocument = {
  _id: string;
  auth: string;
  createdAt: number;
  endpoint: string;
  expirationTime?: number;
  identityId: string;
  p256dh: string;
};
