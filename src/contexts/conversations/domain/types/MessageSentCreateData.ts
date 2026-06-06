import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Signature, Timestamp } from '@haskou/value-objects';

import { AttachmentExternalIdentifier } from '../value-objects/AttachmentExternalIdentifier';
import { ConversationId } from '../value-objects/ConversationId';
import { EncryptedMessagePayload } from '../value-objects/EncryptedMessagePayload';
import { MessageId } from '../value-objects/MessageId';

export type MessageSentCreateData = {
  attachmentExternalIdentifiers?: AttachmentExternalIdentifier[];
  authorId: IdentityId;
  conversationId: ConversationId;
  createdAt?: Timestamp;
  encryptedPayload: EncryptedMessagePayload;
  id?: MessageId;
  previousMessageIds?: MessageId[];
  replyToMessageId?: MessageId;
  signature: Signature;
};
