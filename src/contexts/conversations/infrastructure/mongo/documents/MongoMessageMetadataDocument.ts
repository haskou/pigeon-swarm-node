import { MessageTypeValue } from '../../../domain/value-objects/MessageType';

export interface MongoMessageMetadataDocument {
  _id: string;
  messageId: string;
  cid: string;
  conversationId: string;
  authorId: string;
  recipientIds: string[];
  networkId: string | undefined;
  type: MessageTypeValue;
  createdAt: number;
  receivedAt: number;
  targetMessageId: string | undefined;
  valid: boolean;
}
