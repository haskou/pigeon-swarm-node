export type PayloadTooLargeError = Error & {
  status?: number;
  statusCode?: number;
  type?: string;
};
