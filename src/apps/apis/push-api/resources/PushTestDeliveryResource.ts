export type PushTestDeliveryResource = {
  body?: string;
  delivered: boolean;
  endpoint: string;
  endpointHost: string;
  error?: string;
  removed: boolean;
  statusCode?: number;
};
