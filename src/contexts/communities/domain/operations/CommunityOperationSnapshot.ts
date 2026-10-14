/** The whole value an operation sets, by argument name. */
export type CommunityOperationSnapshot = Record<
  string,
  boolean | string | string[] | undefined
>;
