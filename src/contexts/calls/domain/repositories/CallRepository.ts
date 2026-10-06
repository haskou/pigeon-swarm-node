import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

import { Call } from '../Call';
import { CallId } from '../value-objects/CallId';

export default abstract class CallRepository {
  public abstract findActiveByCommunity(
    communityId: CommunityId,
  ): Promise<Call[]>;

  public abstract findActiveByCommunityChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): Promise<Call | undefined>;

  public abstract findActiveByParticipant(
    participantId: IdentityId,
  ): Promise<Call[]>;

  public abstract findByCommunityChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): Promise<Call[]>;

  public abstract findByConversationId(
    conversationId: ConversationId,
  ): Promise<Call[]>;

  public abstract findById(id: CallId): Promise<Call | undefined>;
  public abstract findByParticipant(participantId: IdentityId): Promise<Call[]>;

  public abstract findTimedOutRingingCalls(
    timeoutThreshold: Timestamp,
  ): Promise<Call[]>;

  /** Persists the creator-signed start record of the call. */
  public abstract saveStart(
    call: Call,
    proof: PublicMutationProof,
  ): Promise<void>;

  /** Persists the signed state of one participant (joined, left or declined). */
  public abstract saveParticipant(
    call: Call,
    identityId: IdentityId,
    proof: PublicMutationProof,
  ): Promise<void>;

  /** Persists the signed end record of the call. */
  public abstract saveEnd(
    call: Call,
    proof: PublicMutationProof,
  ): Promise<void>;

  /**
   * Resolves true once another signed record of the call is admitted, false on
   * timeout (or when too many callers are already waiting).
   */
  public abstract awaitUpdate(id: CallId, timeoutMs: number): Promise<boolean>;

  /** Marks a ringing call as missed on this node only; nothing replicates. */
  public abstract markTimedOut(call: Call): Promise<void>;
}
