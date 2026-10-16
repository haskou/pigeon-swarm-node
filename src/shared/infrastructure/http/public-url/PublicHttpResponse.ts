import { IncomingHttpHeaders } from 'http';

export type PublicHttpResponse = {
  /** Read only for a 2xx answer; empty otherwise. */
  body: Buffer;
  /** Lowercase names, as Node.js parsed them. */
  headers: IncomingHttpHeaders;
  /** The `Location` of a 3xx answer, never followed. */
  redirectLocation: URL | undefined;
  statusCode: number;
};
