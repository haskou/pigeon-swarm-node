import { Document } from 'mongodb';

export type ConversationRoutingDocument = Document & {
  _id: string;
  participantIds?: string[];
};
