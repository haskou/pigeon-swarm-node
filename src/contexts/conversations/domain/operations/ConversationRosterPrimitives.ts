export type ConversationRosterPrimitives = {
  admins: string[];
  creator: string;
  id: string;
  members: string[];
  name?: string;
  networkId: string;
  type: 'group' | 'one-to-one';
};
