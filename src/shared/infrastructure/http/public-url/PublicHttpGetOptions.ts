export type PublicHttpGetOptions = {
  /** Sent as `Accept`. */
  accept: string;
  /** A `Content-Type` the body must contain, when the response states one. */
  expectedContentType: string;
  /** The body is read up to this many bytes; one more aborts the download. */
  maxBytes: number;
  /** Total time for resolving, connecting and reading the whole body. */
  timeoutMs: number;
  userAgent: string;
};
