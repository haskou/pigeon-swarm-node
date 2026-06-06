import { PollId } from '@app/contexts/polls/domain/value-objects/PollId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Signature, Timestamp } from '@haskou/value-objects';

import { ConversationId } from '../value-objects/ConversationId';
import { MessageId } from '../value-objects/MessageId';

export type MessagePollCreateData = {
  authorId: IdentityId;
  conversationId: ConversationId;
  createdAt?: Timestamp;
  id?: MessageId;
  pollId: PollId;
  previousMessageIds?: MessageId[];
  signature: Signature;
};
