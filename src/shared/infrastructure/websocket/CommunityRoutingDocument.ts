import { Document } from 'mongodb';

export type CommunityRoutingDocument = Document & {
  _id: string;
  memberIds?: string[];
};
