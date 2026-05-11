import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { Conversation } from '../Conversation';
import { Message } from '../Message';
import { ConversationId } from '../value-objects/ConversationId';
import { MessageId } from '../value-objects/MessageId';

export interface ConversationMessageCandidate {
  authorIdentityId: string;
  createdAt: number;
  messageId: string;
  messageType: string;
}

export interface ConversationRepository {
  findById(conversationId: ConversationId): Promise<Conversation | undefined>;
  findCandidateMessageById(
    conversationId: ConversationId,
    messageId: MessageId,
  ): Promise<Message | undefined>;
  findMessageCandidates(
    conversationId: ConversationId,
    limit: number,
  ): Promise<ConversationMessageCandidate[]>;
  findByParticipant(
    participantId: IdentityId,
    limit: number,
    beforeConversationId?: ConversationId,
  ): Promise<Conversation[]>;
  findLatestMessages(
    conversationId: ConversationId,
    limit: number,
    beforeMessageId?: MessageId,
  ): Promise<Message[]>;
  findMessageById(
    conversationId: ConversationId,
    messageId: MessageId,
  ): Promise<Message | undefined>;
  findOneToOne(
    firstIdentityId: IdentityId,
    secondIdentityId: IdentityId,
  ): Promise<Conversation | undefined>;
  save(conversation: Conversation): Promise<void>;
}
