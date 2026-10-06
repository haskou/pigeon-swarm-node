import { ConversationOperationArguments } from './ConversationOperationArguments';

export type ConversationOperationPrimitives = {
  action: string;
  args: ConversationOperationArguments;
  authorIdentityId: string;
  conversationId: string;
  createdAt: number;
  id: string;
  networkId: string;
  parents: string[];
  scopeType: 'conversation_operation';
};
