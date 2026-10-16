import { CommitmentId } from '@haskou/pigeon-swarm-crypto';
import { ShortId, StringValueObject } from '@haskou/value-objects';

export class CommunityChannelId extends StringValueObject {
  public static derive(
    communityId: string,
    creatorIdentityId: string,
    createdAt: number,
  ): CommunityChannelId {
    return new CommunityChannelId(
      CommitmentId.communityChannel(communityId, creatorIdentityId, createdAt),
    );
  }

  public static generate(): CommunityChannelId {
    return new CommunityChannelId(ShortId.generate().valueOf());
  }
}
