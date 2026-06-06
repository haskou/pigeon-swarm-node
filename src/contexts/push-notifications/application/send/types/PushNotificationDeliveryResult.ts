export type PushNotificationDeliveryResult = {
  body?: string;
  delivered: boolean;
  endpoint: string;
  endpointHost: string;
  error?: string;
  shouldDeleteSubscription: boolean;
  statusCode?: number;
};
