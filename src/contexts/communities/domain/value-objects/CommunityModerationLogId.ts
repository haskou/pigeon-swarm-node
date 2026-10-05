import { ShortId } from '@haskou/value-objects';
import { createHash } from 'crypto';

export class CommunityModerationLogId extends ShortId {
  /**
   * First 24 hex chars of
   * sha256(JSON([communityId, actor, action, targetType, targetId, createdAt])).
   */
  public static derive(
    communityId: string,
    actorIdentityId: string,
    action: string,
    targetType: string,
    targetId: string,
    createdAt: number,
  ): CommunityModerationLogId {
    return new CommunityModerationLogId(
      createHash('sha256')
        .update(
          JSON.stringify([
            communityId,
            actorIdentityId,
            action,
            targetType,
            targetId,
            createdAt,
          ]),
        )
        .digest('hex')
        .slice(0, 24),
    );
  }
}
