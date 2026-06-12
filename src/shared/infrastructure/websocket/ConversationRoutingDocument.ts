export type ConversationRoutingDocument = Record<string, unknown> & {
  _id: string;
  participantIds?: string[];
};
