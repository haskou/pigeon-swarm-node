import { MessageEventTypeValue } from '../../../domain/value-objects/MessageEventType';

export interface MongoMessageEventMetadataDocument {
  _id: string;
  eventId: string;
  cid: string;
  conversationId: string;
  authorId: string;
  recipientIds: string[];
  networkId: string | undefined;
  type: MessageEventTypeValue;
  createdAt: number;
  receivedAt: number;
  targetEventId: string | undefined;
  valid: boolean;
}
