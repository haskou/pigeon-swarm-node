export type PushNotificationDeliveryResult = {
  delivered: boolean;
  endpoint: string;
  endpointHost: string;
  error?: string;
  shouldDeleteSubscription: boolean;
  statusCode?: number;
};
