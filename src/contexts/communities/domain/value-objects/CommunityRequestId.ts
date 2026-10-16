import { CommitmentId } from '@haskou/pigeon-swarm-crypto';
import { ShortId } from '@haskou/value-objects';

import { CommunityRequestType } from './CommunityRequestType';

export class CommunityRequestId extends ShortId {
  public static derive(
    communityId: string,
    type: CommunityRequestType,
    creatorIdentityId: string,
    identityId: string,
    createdAt: number,
  ): CommunityRequestId {
    return new CommunityRequestId(
      CommitmentId.communityRequest(
        communityId,
        type.isInvitation() ? 'invitation' : 'request',
        creatorIdentityId,
        identityId,
        createdAt,
      ),
    );
  }
}
