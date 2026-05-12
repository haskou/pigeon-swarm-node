import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

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

export interface ConversationSyncScope {
  conversationId: string;
  networkId: string;
}

export interface ConversationMessagesAround {
  messages: Message[];
  nextCursor?: string;
  previousCursor?: string;
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
  findMessagesAround(
    conversationId: ConversationId,
    messageId: MessageId,
    before: number,
    after: number,
  ): Promise<ConversationMessagesAround>;
  findOneToOne(
    firstIdentityId: IdentityId,
    secondIdentityId: IdentityId,
    networkId: NetworkId,
  ): Promise<Conversation | undefined>;
  findConversationSyncScopes(): Promise<ConversationSyncScope[]>;
  save(conversation: Conversation): Promise<void>;
}
