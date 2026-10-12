import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

import { Conversation } from '../Conversation';
import { ConversationMessagesAround } from '../ConversationMessagesAround';
import { Message } from '../entities/messages/Message';
import { ConversationOperation } from '../operations/ConversationOperation';
import { ConversationId } from '../value-objects/ConversationId';
import { MessageId } from '../value-objects/MessageId';

export default abstract class ConversationRepository {
  /** Rejects with ConversationNotFoundError when the conversation is not stored. */
  public abstract requireById(
    conversationId: ConversationId,
  ): Promise<Conversation>;

  public abstract hasById(conversationId: ConversationId): Promise<boolean>;

  /** Rejects with ConversationNotFoundError when the conversation is not stored. */
  public abstract requireMetadataById(
    conversationId: ConversationId,
  ): Promise<Conversation>;

  /**
   * The conversation folded from the causal past of `frontier`. Rejects with
   * ConversationNotFoundError when that past does not fold to a roster; throws
   * when a head is unknown.
   */
  public abstract requireMetadataAtFrontier(
    conversationId: ConversationId,
    frontier: string[],
  ): Promise<Conversation>;

  /** Rejects with ConversationNotFoundError when the candidate is not stored. */
  public abstract requireCandidateMessageById(
    conversationId: ConversationId,
    messageId: MessageId,
  ): Promise<Message>;

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

  /** Rejects with MessageTargetNotFoundError when the message is not stored. */
  public abstract requireMessageById(
    conversationId: ConversationId,
    messageId: MessageId,
  ): Promise<Message>;

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

  /**
   * Advances the reader's marker to the message. Resolves to `false` when the
   * stored marker already points at a later message; the stored marker is kept.
   */
  public abstract markReadUntil(
    conversationId: ConversationId,
    recipientIdentityId: IdentityId,
    messageId: MessageId,
    networkId?: NetworkId,
  ): Promise<boolean>;

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
