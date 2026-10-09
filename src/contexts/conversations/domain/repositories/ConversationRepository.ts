import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

import { Conversation } from '../Conversation';
import { ConversationMessagesAround } from '../ConversationMessagesAround';
import { Message } from '../entities/messages/Message';
import { OneToOneConversation } from '../OneToOneConversation';
import { ConversationOperation } from '../operations/ConversationOperation';
import { ConversationId } from '../value-objects/ConversationId';
import { MessageId } from '../value-objects/MessageId';

export default abstract class ConversationRepository {
  public abstract findById(
    conversationId: ConversationId,
  ): Promise<Conversation | undefined>;

  public abstract findMetadataById(
    conversationId: ConversationId,
  ): Promise<Conversation | undefined>;

  /** The conversation folded from the causal past of `frontier`; throws when a head is unknown. */
  public abstract findMetadataAtFrontier(
    conversationId: ConversationId,
    frontier: string[],
  ): Promise<Conversation | undefined>;

  public abstract findCandidateMessageById(
    conversationId: ConversationId,
    messageId: MessageId,
  ): Promise<Message | undefined>;

  /**
   * The conversations `participantId` belongs to in the folded state, newest
   * first. The participant index is local: it is the fold of the cached logs.
   */
  public abstract findByParticipant(
    participantId: IdentityId,
    limit: number,
    beforeConversationId?: ConversationId,
  ): Promise<Conversation[]>;

  /** The operations nobody built on yet: the parents of the next operation. */
  public abstract findFrontier(
    conversationId: ConversationId,
  ): Promise<string[]>;

  /** Every stored operation of the conversation log, in no particular order. */
  public abstract findOperations(
    conversationId: ConversationId,
  ): Promise<ConversationOperation[]>;

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

  /**
   * Persists the new messages of the conversation. Every message that is new
   * to the replicated store is written together with its client-signed proof,
   * keyed by message id; a new message without a proof is rejected. The
   * conversation itself (participants and roles) is never written here.
   */
  public abstract save(
    conversation: Conversation,
    proofs?: ReadonlyMap<string, PublicMutationProof>,
  ): Promise<void>;

  /**
   * Persists one client-signed operation of a conversation log (the genesis
   * creation record included) with its proof.
   */
  public abstract saveOperation(
    operation: ConversationOperation,
    proof: PublicMutationProof,
  ): Promise<void>;
}
