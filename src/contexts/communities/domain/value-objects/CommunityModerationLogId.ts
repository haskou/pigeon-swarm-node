import { CommitmentId } from '@haskou/pigeon-swarm-crypto';
import { ShortId } from '@haskou/value-objects';

export class CommunityModerationLogId extends ShortId {
  public static derive(
    communityId: string,
    actorIdentityId: string,
    action: string,
    targetType: string,
    targetId: string,
    createdAt: number,
  ): CommunityModerationLogId {
    return new CommunityModerationLogId(
      CommitmentId.communityModerationLog(
        communityId,
        actorIdentityId,
        action,
        targetType,
        targetId,
        createdAt,
      ),
    );
  }
}
