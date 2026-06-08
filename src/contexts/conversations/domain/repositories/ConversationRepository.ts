import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

import { Conversation } from '../Conversation';
import { Message } from '../Message';
import { OneToOneConversation } from '../OneToOneConversation';
import { ConversationId } from '../value-objects/ConversationId';
import { MessageId } from '../value-objects/MessageId';
import { ConversationMessageCandidate } from './types/ConversationMessageCandidate';
import { ConversationMessagesAround } from './types/ConversationMessagesAround';
import { ConversationSyncScope } from './types/ConversationSyncScope';

export interface ConversationRepository {
  findById(conversationId: ConversationId): Promise<Conversation | undefined>;
  findMetadataById(
    conversationId: ConversationId,
  ): Promise<Conversation | undefined>;
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
  findByNetworkId(networkId: NetworkId, limit: number): Promise<Conversation[]>;
  findLatestMessages(
    conversationId: ConversationId,
    limit: number,
    beforeMessageId?: MessageId,
  ): Promise<Message[]>;
  findMessageById(
    conversationId: ConversationId,
    messageId: MessageId,
  ): Promise<Message | undefined>;
  hasMessage(
    conversationId: ConversationId,
    messageId: MessageId,
  ): Promise<boolean>;
  findMessagesAround(
    conversationId: ConversationId,
    messageId: MessageId,
    before: number,
    after: number,
  ): Promise<ConversationMessagesAround>;
  findThreadMessages(
    conversationId: ConversationId,
    rootMessageId: MessageId,
    limit: number,
  ): Promise<Message[]>;
  countUnreadByRecipient(
    recipientIdentityId: IdentityId,
    conversationIds: ConversationId[],
  ): Promise<Map<string, number>>;
  hasUnreadMessageForRecipient(
    recipientIdentityId: IdentityId,
    conversationId: ConversationId,
    messageId: MessageId,
  ): Promise<boolean>;
  findOneToOne(
    firstIdentityId: IdentityId,
    secondIdentityId: IdentityId,
    networkId: NetworkId,
  ): Promise<OneToOneConversation | undefined>;
  findConversationSyncScopes(): Promise<ConversationSyncScope[]>;
  markReadUntil(
    conversationId: ConversationId,
    recipientIdentityId: IdentityId,
    messageId: MessageId,
  ): Promise<void>;
  registerUnreadForMessage(
    conversation: Conversation,
    message: Message,
  ): Promise<void>;
  save(conversation: Conversation): Promise<void>;
}
