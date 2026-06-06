export type WebPushError = Error & {
  body?: unknown;
  statusCode?: number;
};
