import { CommunityModerationLogEntry } from '../entities/moderation/CommunityModerationLogEntry';
import { CommunityId } from '../value-objects/CommunityId';
import { CommunityModerationLogId } from '../value-objects/CommunityModerationLogId';

export interface CommunityModerationLogRepository {
  deleteByCommunity(communityId: CommunityId): Promise<void>;
  findByCommunity(
    communityId: CommunityId,
    limit: number,
    beforeLogId?: CommunityModerationLogId,
  ): Promise<CommunityModerationLogEntry[]>;
  save(entry: CommunityModerationLogEntry): Promise<void>;
}
