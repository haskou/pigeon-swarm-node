import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { Conversation } from '../Conversation';
import { DatedConversation } from '../DatedConversation';
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
   * Every conversation `participantId` belongs to in the folded state, newest
   * first. The participant index is local: it is the fold of the cached logs.
   */
  public abstract findByParticipant(
    participantId: IdentityId,
  ): Promise<DatedConversation[]>;

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
