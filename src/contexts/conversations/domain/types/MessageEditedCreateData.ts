import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Signature, Timestamp } from '@haskou/value-objects';

import { ConversationId } from '../value-objects/ConversationId';
import { EncryptedMessagePayload } from '../value-objects/EncryptedMessagePayload';
import { MessageId } from '../value-objects/MessageId';

export type MessageEditedCreateData = {
  authorId: IdentityId;
  conversationId: ConversationId;
  createdAt?: Timestamp;
  encryptedPayload: EncryptedMessagePayload;
  id?: MessageId;
  previousMessageIds?: MessageId[];
  signature: Signature;
  targetMessageId: MessageId;
};
