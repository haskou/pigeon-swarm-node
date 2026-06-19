import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Signature, Timestamp } from '@haskou/value-objects';

import { ConversationId } from '../../../value-objects/ConversationId';
import { MessageId } from '../../../value-objects/MessageId';

export type MessageDeletedCreateData = {
  authorId: IdentityId;
  conversationId: ConversationId;
  createdAt?: Timestamp;
  id?: MessageId;
  previousMessageIds?: MessageId[];
  signature: Signature;
  targetMessageId: MessageId;
};
