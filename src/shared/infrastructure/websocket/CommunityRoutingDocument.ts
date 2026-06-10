export type CommunityRoutingDocument = Record<string, unknown> & {
  _id: string;
  memberIds?: string[];
};
