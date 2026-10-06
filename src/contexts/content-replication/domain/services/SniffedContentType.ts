export type SniffedContentType = {
  /** Media type to serve. */
  contentType: string;
  /** Whether a browser may render it in place instead of downloading it. */
  inline: boolean;
};
