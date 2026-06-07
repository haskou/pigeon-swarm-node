export type PushTestDeliveryResource = {
  delivered: boolean;
  endpoint: string;
  endpointHost: string;
  error?: string;
  removed: boolean;
  statusCode?: number;
};
