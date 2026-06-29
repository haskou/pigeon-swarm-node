import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

import { Conversation } from '../Conversation';
import { ConversationMessagesAround } from '../ConversationMessagesAround';
import { Message } from '../entities/messages/Message';
import { OneToOneConversation } from '../OneToOneConversation';
import { ConversationId } from '../value-objects/ConversationId';
import { MessageId } from '../value-objects/MessageId';

export default abstract class ConversationRepository {
  public abstract findById(
    conversationId: ConversationId,
  ): Promise<Conversation | undefined>;

  public abstract findMetadataById(
    conversationId: ConversationId,
  ): Promise<Conversation | undefined>;

  public abstract findCandidateMessageById(
    conversationId: ConversationId,
    messageId: MessageId,
  ): Promise<Message | undefined>;

  public abstract findByParticipant(
    participantId: IdentityId,
    limit: number,
    beforeConversationId?: ConversationId,
  ): Promise<Conversation[]>;

  public abstract findLatestMessages(
    conversationId: ConversationId,
    limit: number,
    beforeMessageId?: MessageId,
  ): Promise<Message[]>;

  public abstract findMessageById(
    conversationId: ConversationId,
    messageId: MessageId,
  ): Promise<Message | undefined>;

  public abstract hasMessage(
    conversationId: ConversationId,
    messageId: MessageId,
  ): Promise<boolean>;

  public abstract findMessagesAround(
    conversationId: ConversationId,
    messageId: MessageId,
    before: number,
    after: number,
  ): Promise<ConversationMessagesAround>;

  public abstract findThreadMessages(
    conversationId: ConversationId,
    rootMessageId: MessageId,
    limit: number,
  ): Promise<Message[]>;

  public abstract countUnreadByRecipient(
    recipientIdentityId: IdentityId,
    conversationIds: ConversationId[],
  ): Promise<Map<string, number>>;

  public abstract hasUnreadMessageForRecipient(
    recipientIdentityId: IdentityId,
    conversationId: ConversationId,
    messageId: MessageId,
  ): Promise<boolean>;

  public abstract findOneToOne(
    firstIdentityId: IdentityId,
    secondIdentityId: IdentityId,
    networkId: NetworkId,
  ): Promise<OneToOneConversation | undefined>;

  public abstract markReadUntil(
    conversationId: ConversationId,
    recipientIdentityId: IdentityId,
    messageId: MessageId,
    networkId?: NetworkId,
  ): Promise<void>;

  public abstract save(conversation: Conversation): Promise<void>;
}
