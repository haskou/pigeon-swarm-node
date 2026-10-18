export type SignedHttpRequest = {
  body?: unknown;
  header(header: string): string | string[] | undefined;
  method: string;
  /** Raw request target as received: the path, then `?` and the raw query. */
  originalUrl: string;
};
