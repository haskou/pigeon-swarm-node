export type ContentSignature = {
  /** Magic bytes that identify the format. */
  bytes: number[];
  contentType: string;
  /** Where the magic bytes start; the beginning of the content by default. */
  offset?: number;
};
