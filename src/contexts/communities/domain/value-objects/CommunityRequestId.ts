import { ShortId } from '@haskou/value-objects';
import { createHash } from 'crypto';

export class CommunityRequestId extends ShortId {
  /** First 24 hex chars of sha256(JSON([communityId, type, creator, identity, createdAt])). */
  public static derive(
    communityId: string,
    type: string,
    creatorIdentityId: string,
    identityId: string,
    createdAt: number,
  ): CommunityRequestId {
    return new CommunityRequestId(
      createHash('sha256')
        .update(
          JSON.stringify([
            communityId,
            type,
            creatorIdentityId,
            identityId,
            createdAt,
          ]),
        )
        .digest('hex')
        .slice(0, 24),
    );
  }
}
