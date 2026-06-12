import { CommunityModerationLogEntry } from '../entities/moderation/CommunityModerationLogEntry';
import { CommunityId } from '../value-objects/CommunityId';
import { CommunityModerationLogId } from '../value-objects/CommunityModerationLogId';

export default abstract class CommunityModerationLogRepository {
  public abstract deleteByCommunity(communityId: CommunityId): Promise<void>;
  public abstract findByCommunity(
    communityId: CommunityId,
    limit: number,
    beforeLogId?: CommunityModerationLogId,
  ): Promise<CommunityModerationLogEntry[]>;

  public abstract save(entry: CommunityModerationLogEntry): Promise<void>;
}
