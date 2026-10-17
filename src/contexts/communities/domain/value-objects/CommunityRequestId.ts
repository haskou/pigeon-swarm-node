import { CommitmentId } from '@haskou/pigeon-swarm-crypto';
import { ShortId } from '@haskou/value-objects';

export class CommunityRequestId extends ShortId {
  public static derive(
    communityId: string,
    creatorIdentityId: string,
    identityId: string,
    createdAt: number,
  ): CommunityRequestId {
    return new CommunityRequestId(
      CommitmentId.communityRequest(
        communityId,
        'request',
        creatorIdentityId,
        identityId,
        createdAt,
      ),
    );
  }
}
