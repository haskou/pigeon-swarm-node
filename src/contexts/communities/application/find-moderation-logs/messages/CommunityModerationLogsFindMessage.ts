import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CommunityId } from '../../../domain/value-objects/CommunityId';
import { CommunityModerationLogId } from '../../../domain/value-objects/CommunityModerationLogId';

export class CommunityModerationLogsFindMessage {
  public readonly actorIdentityId: IdentityId;
  public readonly beforeLogId?: CommunityModerationLogId;
  public readonly communityId: CommunityId;
  public readonly limit: number;

  constructor(
    communityId: string,
    actorIdentityId: string,
    limit: number | undefined,
    beforeLogId?: string,
  ) {
    this.actorIdentityId = new IdentityId(actorIdentityId);
    this.beforeLogId = beforeLogId
      ? new CommunityModerationLogId(beforeLogId)
      : undefined;
    this.communityId = new CommunityId(communityId);
    this.limit = Math.min(Math.max(limit || 50, 1), 100);
  }
}
