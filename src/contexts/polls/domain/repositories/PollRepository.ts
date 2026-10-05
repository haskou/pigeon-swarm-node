import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

import { Poll } from '../Poll';
import { PollId } from '../value-objects/PollId';

export default abstract class PollRepository {
  public abstract findByCommunityChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
    limit: number,
    beforeCreatedAt?: number,
  ): Promise<Poll[]>;

  public abstract findByGroupConversation(
    conversationId: ConversationId,
    limit: number,
    beforeCreatedAt?: number,
  ): Promise<Poll[]>;

  public abstract findById(id: PollId): Promise<Poll | undefined>;

  /** Stores the creator-signed poll definition. */
  public abstract save(poll: Poll, proof: PublicMutationProof): Promise<void>;

  /** Stores the voter-signed ballot, or its tombstone when the poll holds none. */
  public abstract saveVote(
    poll: Poll,
    voterIdentityId: IdentityId,
    proof: PublicMutationProof,
  ): Promise<void>;

  /** Stores the closer-signed close record. */
  public abstract saveClose(
    poll: Poll,
    closedByIdentityId: IdentityId,
    closedAt: Timestamp,
    proof: PublicMutationProof,
  ): Promise<void>;
}
