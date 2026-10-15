export type PublicHttpResponse = {
  /** Read only for a 2xx answer; empty otherwise. */
  body: Buffer;
  /** The `Location` of a 3xx answer, never followed. */
  redirectLocation: URL | undefined;
  statusCode: number;
};
