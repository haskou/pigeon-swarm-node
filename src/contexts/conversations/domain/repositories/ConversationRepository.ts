import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { Conversation } from '../Conversation';
import { ConversationOperation } from '../operations/ConversationOperation';
import { ConversationId } from '../value-objects/ConversationId';

/**
 * Conversations are metadata only: the signed operation log and its fold.
 * Messages and read state never reach the node; they travel through opaque
 * mailboxes.
 */
export default abstract class ConversationRepository {
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

  /**
   * The conversations `participantId` belongs to in the folded state, newest
   * first. The participant index is local: it is the fold of the cached logs.
   */
  public abstract findByParticipant(
    participantId: IdentityId,
    limit: number,
    beforeConversationId?: ConversationId,
  ): Promise<Conversation[]>;

  /**
   * The one-to-one conversations `participantId` belongs to, newest first.
   * Group co-membership grants nothing outside the group, so callers that
   * decide who learns about an identity read only these.
   */
  public abstract findOneToOneByParticipant(
    participantId: IdentityId,
    limit: number,
  ): Promise<Conversation[]>;

  /** The operations nobody built on yet: the parents of the next operation. */
  public abstract findFrontier(
    conversationId: ConversationId,
  ): Promise<string[]>;

  /** Every stored operation of the conversation log, in no particular order. */
  public abstract findOperations(
    conversationId: ConversationId,
  ): Promise<ConversationOperation[]>;

  /**
   * Persists one client-signed operation of a conversation log (the genesis
   * creation record included) with its proof.
   */
  public abstract saveOperation(
    operation: ConversationOperation,
    proof: PublicMutationProof,
  ): Promise<void>;
}
