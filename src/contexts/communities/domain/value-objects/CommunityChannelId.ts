import { ShortId, StringValueObject } from '@haskou/value-objects';
import { createHash } from 'crypto';

export class CommunityChannelId extends StringValueObject {
  /** First 24 hex chars of sha256(JSON(['channel', communityId, creator, createdAt])). */
  public static derive(
    communityId: string,
    creatorIdentityId: string,
    createdAt: number,
  ): CommunityChannelId {
    return new CommunityChannelId(
      createHash('sha256')
        .update(
          JSON.stringify(['channel', communityId, creatorIdentityId, createdAt]),
        )
        .digest('hex')
        .slice(0, 24),
    );
  }

  public static generate(): CommunityChannelId {
    return new CommunityChannelId(ShortId.generate().valueOf());
  }
}
