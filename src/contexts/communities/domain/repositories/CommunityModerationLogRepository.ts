import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';

import { CommunityModerationLogEntry } from '../entities/moderation/CommunityModerationLogEntry';
import { CommunityId } from '../value-objects/CommunityId';
import { CommunityModerationLogId } from '../value-objects/CommunityModerationLogId';

export default abstract class CommunityModerationLogRepository {
  public abstract findByCommunity(
    communityId: CommunityId,
    limit: number,
    beforeLogId?: CommunityModerationLogId,
  ): Promise<CommunityModerationLogEntry[]>;

  /** Stores the entry with the client's signed `moderationLogs` mutation. */
  public abstract save(
    entry: CommunityModerationLogEntry,
    proof: PublicMutationProof,
  ): Promise<void>;
}
