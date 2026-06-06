import { MongoConversationDocument } from '@app/contexts/conversations/infrastructure/mongo/documents/MongoConversationDocument';

export type ConversationIdentifier = Pick<MongoConversationDocument, '_id'>;
